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

beforeEach(async () => {
  const runTmux: TmuxRunner = async (args) => {
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
      return { stdout: "34\t120\n", stderr: "" };
    }

    return { stdout: "", stderr: "" };
  };

  server = createApiServer({ runTmux });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server!.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server?.close((error?: Error) => (error ? reject(error) : resolve())),
  );
});

describe("api server", () => {
  test("serves health", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "tmuapp-api" });
  });

  test("keeps unknown app routes available for static hosting", async () => {
    const response = await fetch(`${baseUrl}/missing-app-route`);

    expect(response.status).toBe(404);
  });

  test("serves tmux session snapshot", async () => {
    const response = await fetch(`${baseUrl}/api/sessions`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions[0].name).toBe("work");
    expect(data.windows.$1[0].name).toBe("api");
    expect(data.panes["@1"][0].currentCommand).toBe("bash");
  });

  test("captures ansi pane output with terminal dimensions", async () => {
    const response = await fetch(`${baseUrl}/api/panes/%251/capture?lines=20`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ansi).toContain("ready");
    expect(data.terminal).toEqual({ rows: 34, columns: 120 });
  });
});
