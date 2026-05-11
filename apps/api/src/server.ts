import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { URL } from "node:url";
import { createTmuxService, type TmuxRunner } from "./tmux.js";

export type ApiServerOptions = {
  runTmux?: TmuxRunner;
  staticDir?: string;
};

export function createApiServer(options: ApiServerOptions = {}) {
  const tmux = createTmuxService(options.runTmux);
  const staticDir = options.staticDir ?? join(process.cwd(), "apps/website/dist");

  return createServer(async (request, response) => {
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
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(data === undefined ? undefined : JSON.stringify(data));
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
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
