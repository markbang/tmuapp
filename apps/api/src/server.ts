import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { buildSendKeysArgs, createTmuxService, runTmux, type TmuxRunner } from "./tmux.js";
import { sanitizeTarget } from "utils";
import { createTmuxStream, type TmuxStreamRunner } from "./tmux-stream.js";

export type ApiServerOptions = {
  authToken?: string;
  runTmux?: TmuxRunner;
  runTmuxStream?: TmuxStreamRunner;
  staticDir?: string;
};

const maxJsonBytes = 64 * 1024;
const defaultStaticDir = join(dirname(fileURLToPath(import.meta.url)), "../../website/dist");

export function createApiServer(options: ApiServerOptions = {}) {
  const tmux = createTmuxService(options.runTmux);
  const staticDir = options.staticDir ?? defaultStaticDir;
  const authToken = options.authToken?.trim();

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    try {
      if (request.method === "OPTIONS") {
        send(response, 204, undefined);
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, service: "tmuapp-api" });
        return;
      }

      if (authToken && url.pathname.startsWith("/api/") && !isAuthorized(request, authToken)) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }

      if (
        request.method === "GET" &&
        !url.pathname.startsWith("/api/") &&
        serveStatic(staticDir, url.pathname, response)
      ) {
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/sessions") {
        send(response, 200, await tmux.snapshot());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const body = await readJson<{ name?: string; cwd?: string }>(request);
        send(response, 201, await tmux.createSession(required(body.name, "name"), body.cwd));
        return;
      }

      const sessionTarget = match(url.pathname, /^\/api\/sessions\/(.+)$/);
      if (request.method === "DELETE" && sessionTarget) {
        send(response, 200, await tmux.killSession(decodeURIComponent(sessionTarget)));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/windows") {
        const body = await readJson<{ target?: string; name?: string }>(request);
        send(response, 201, await tmux.createWindow(required(body.target, "target"), body.name));
        return;
      }

      const windowTarget = match(url.pathname, /^\/api\/windows\/(.+)$/);
      if (request.method === "DELETE" && windowTarget) {
        send(response, 200, await tmux.killWindow(decodeURIComponent(windowTarget)));
        return;
      }

      const paneCaptureTarget = match(url.pathname, /^\/api\/panes\/(.+)\/capture$/);
      if (request.method === "GET" && paneCaptureTarget) {
        send(
          response,
          200,
          await tmux.capturePane(
            decodeURIComponent(paneCaptureTarget),
            Number(url.searchParams.get("lines") ?? 80),
          ),
        );
        return;
      }

      const paneSplitTarget = match(url.pathname, /^\/api\/panes\/(.+)\/split$/);
      if (request.method === "POST" && paneSplitTarget) {
        const body = await readJson<{ direction?: "horizontal" | "vertical" }>(request);
        send(
          response,
          201,
          await tmux.splitPane(decodeURIComponent(paneSplitTarget), body.direction ?? "horizontal"),
        );
        return;
      }

      const paneInputTarget = match(url.pathname, /^\/api\/panes\/(.+)\/input$/);
      if (request.method === "POST" && paneInputTarget) {
        const body = await readJson<{ data?: string }>(request);
        send(
          response,
          200,
          await tmux.sendInput(decodeURIComponent(paneInputTarget), required(body.data, "data")),
        );
        return;
      }

      const paneKeysTarget = match(url.pathname, /^\/api\/panes\/(.+)\/keys$/);
      if (request.method === "POST" && paneKeysTarget) {
        const body = await readJson<{ keys?: string[] }>(request);
        send(
          response,
          200,
          await tmux.sendKeys(decodeURIComponent(paneKeysTarget), body.keys ?? []),
        );
        return;
      }

      const paneResizeTarget = match(url.pathname, /^\/api\/panes\/(.+)\/resize$/);
      if (request.method === "POST" && paneResizeTarget) {
        const body = await readJson<{ width?: number; height?: number }>(request);
        send(
          response,
          200,
          await tmux.resizePane(
            decodeURIComponent(paneResizeTarget),
            Number(body.width),
            Number(body.height),
          ),
        );
        return;
      }

      send(response, 404, { error: "Not found" });
    } catch (error) {
      send(response, 400, { error: error instanceof Error ? error.message : "Request failed" });
    }
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const paneStreamTarget = match(url.pathname, /^\/api\/panes\/(.+)\/stream$/);

    if (!paneStreamTarget) {
      socket.destroy();
      return;
    }

    if (authToken && !isAuthorized(request, authToken, url.searchParams.get("token"))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (socket) => {
      attachPaneStream(socket, decodeURIComponent(paneStreamTarget), options);
    });
  });

  return server;
}

function attachPaneStream(socket: WebSocket, target: string, options: ApiServerOptions) {
  const safeTarget = sanitizeTarget(target);
  const runCommand = options.runTmux ?? runTmux;
  const stream = createTmuxStream(
    safeTarget,
    {
      onData: (data) => sendSocket(socket, { type: "output", data }),
      onError: (message) => sendSocket(socket, { type: "error", message }),
      onClose: () => socket.close(),
    },
    { runCommand, runStream: options.runTmuxStream },
  );

  socket.on("message", (raw) => {
    try {
      const data =
        typeof raw === "string"
          ? raw
          : Buffer.concat(
              (Array.isArray(raw) ? raw : [raw]).map((chunk) =>
                Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
              ),
            ).toString("utf8");
      const message = JSON.parse(data) as
        | { type: "input"; data?: string }
        | { type: "resize"; columns?: number; rows?: number };

      if (message.type === "input") {
        runSocketCommand(socket, runCommand, buildSendKeysArgs(safeTarget, message.data ?? ""));
      } else if (message.type === "resize") {
        const columns = clampInteger(Number(message.columns), 20, 500);
        const rows = clampInteger(Number(message.rows), 5, 200);
        stream.resizeClient(columns, rows);
        resizeSocketPane(socket, runCommand, safeTarget, columns, rows);
      }
    } catch {
      sendSocket(socket, { type: "error", message: "Invalid stream message" });
    }
  });

  socket.on("close", () => stream.close());
  socket.on("error", () => stream.close());
}

function runSocketCommand(socket: WebSocket, runCommand: TmuxRunner, args: string[]) {
  void runCommand(args).catch((error: unknown) => {
    sendSocket(socket, {
      type: "error",
      message: error instanceof Error ? error.message : "tmux command failed",
    });
  });
}

function resizeSocketPane(
  socket: WebSocket,
  runCommand: TmuxRunner,
  target: string,
  columns: number,
  rows: number,
) {
  void (async () => {
    await runCommand(["resize-window", "-t", target, "-x", String(columns), "-y", String(rows)]);
    await runCommand(["resize-pane", "-t", target, "-x", String(columns), "-y", String(rows)]);
  })().catch((error: unknown) => {
    sendSocket(socket, {
      type: "error",
      message: error instanceof Error ? error.message : "tmux resize failed",
    });
  });
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sendSocket(socket: WebSocket, data: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function serveStatic(staticDir: string, pathname: string, response: ServerResponse) {
  if (!existsSync(staticDir)) {
    return false;
  }

  const requested = pathname === "/" ? "/index.html" : pathname;
  const relative = normalize(decodeURIComponent(requested)).replace(/^\.\.(\/|\\|$)/, "");
  const file = join(staticDir, relative);
  const candidate =
    existsSync(file) && statSync(file).isFile() ? file : join(staticDir, "index.html");

  if (!existsSync(candidate)) {
    return false;
  }

  response.writeHead(200, { "Content-Type": contentType(candidate) });
  createReadStream(candidate).pipe(response);
  return true;
}

function contentType(file: string) {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };

  return types[extname(file)] ?? "application/octet-stream";
}

function send(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "authorization,content-type,x-tmuapp-token",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(data === undefined ? undefined : JSON.stringify(data));
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxJsonBytes) {
      throw new Error("Request body is too large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function isAuthorized(request: IncomingMessage, token: string, queryToken?: string | null) {
  const authorization = request.headers.authorization;
  if (authorization === `Bearer ${token}`) {
    return true;
  }

  return request.headers["x-tmuapp-token"] === token || queryToken === token;
}

function required(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function match(pathname: string, pattern: RegExp) {
  return pattern.exec(pathname)?.[1];
}
