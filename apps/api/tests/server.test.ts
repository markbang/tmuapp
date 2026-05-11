import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createApiServer } from "../src/server.ts";
import type { TmuxRunner } from "../src/tmux.ts";

type TestServer = {
  address: () => { port: number } | string | null;
  close: (callback: (error?: Error) => void) => void;
  listen: (port: number, host: string, callback: () => void) => unknown;
};

let server: TestServer | undefined;
let baseUrl = "";
let tmuxArgs: string[][] = [];
let staticDir: string | undefined;

async function startTestServer(options: { authToken?: string; staticDir?: string } = {}) {
  tmuxArgs = [];
  const runTmux: TmuxRunner = async (args) => {
    tmuxArgs.push(args);
    const command = args[0];

    if (command === "list-sessions") {
      return { stdout: "$1\twork\t1\t1\t1778490000\n", stderr: "" };
    }

    if (command === "list-windows") {
      return { stdout: "@1\t0\tapi\t1\t1\tlayout\n", stderr: "" };
    }

    if (command === "list-panes") {
      return { stdout: "%1\t0\tshell\t1\t120\t34\tbash\t/tmp\n", stderr: "" };
    }

    if (command === "capture-pane") {
      return { stdout: "\u001b[32mready\u001b[0m\n", stderr: "" };
    }

    if (command === "display-message") {
      return { stdout: "34\t120\t7\t12\n", stderr: "" };
    }

    return { stdout: "", stderr: "" };
  };

  server = createApiServer({ authToken: options.authToken, runTmux, staticDir: options.staticDir });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server!.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  await startTestServer();
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server?.close((error?: Error) => (error ? reject(error) : resolve())),
  );

  if (staticDir) {
    rmSync(staticDir, { force: true, recursive: true });
    staticDir = undefined;
  }
});

describe("api server", () => {
  test("serves health", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "tmuapp-api" });
  });

  test("keeps unknown app routes available through the SPA fallback", async () => {
    await new Promise<void>((resolve, reject) =>
      server?.close((error?: Error) => (error ? reject(error) : resolve())),
    );
    staticDir = mkdtempSync(join(tmpdir(), "tmuapp-static-"));
    writeFileSync(join(staticDir, "index.html"), '<div id="app"></div>');
    await startTestServer({ staticDir });

    const response = await fetch(`${baseUrl}/missing-app-route`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="app"></div>');
  });

  test("serves tmux session snapshot", async () => {
    const response = await fetch(`${baseUrl}/api/sessions`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions[0].name).toBe("work");
    expect(data.windows.$1[0].name).toBe("api");
    expect(data.panes["@1"][0].currentCommand).toBe("bash");
  });

  test("captures ansi pane output with requested terminal history and dimensions", async () => {
    const response = await fetch(`${baseUrl}/api/panes/%251/capture?lines=20`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ansi).toContain("ready");
    expect(data.lines).toBe(20);
    expect(data.terminal).toEqual({ rows: 34, columns: 120, cursorRow: 7, cursorColumn: 12 });
    expect(tmuxArgs).toContainEqual(["capture-pane", "-e", "-p", "-S", "-20", "-t", "%1"]);
  });

  test("requires bearer token for API routes when configured", async () => {
    await new Promise<void>((resolve, reject) =>
      server?.close((error?: Error) => (error ? reject(error) : resolve())),
    );
    await startTestServer({ authToken: "secret" });

    const rejected = await fetch(`${baseUrl}/api/sessions`);
    expect(rejected.status).toBe(401);

    const accepted = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Authorization: "Bearer secret" },
    });
    expect(accepted.status).toBe(200);
  });

  test("rejects invalid JSON request bodies", async () => {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON" });
  });

  test("rejects oversized JSON request bodies", async () => {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "work", cwd: "x".repeat(70_000) }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body is too large" });
  });

  test("splits panes through a tmux command", async () => {
    const response = await fetch(`${baseUrl}/api/panes/%251/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "vertical" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ sessions: [{ name: "work" }] });
  });
});
