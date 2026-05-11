import { spawn } from "node:child_process";
import {
  parsePanes,
  parseSessions,
  parseWindows,
  sanitizeTarget,
  tmuxFormats,
  type TmuxSnapshot,
} from "utils";

export type TmuxCommandResult = {
  stdout: string;
  stderr: string;
};

export type TmuxRunner = (args: string[]) => Promise<TmuxCommandResult>;

export type CaptureResult = {
  target: string;
  ansi: string;
  lines: number;
  terminal: {
    rows: number;
    columns: number;
    cursorRow: number;
    cursorColumn: number;
  };
};

export function createTmuxService(run: TmuxRunner = runTmux) {
  return {
    async snapshot(): Promise<TmuxSnapshot> {
      const sessions = parseSessions(
        await stdout(run, ["list-sessions", "-F", tmuxFormats.sessions]),
      );
      const windows: TmuxSnapshot["windows"] = {};
      const panes: TmuxSnapshot["panes"] = {};

      await Promise.all(
        sessions.map(async (session) => {
          windows[session.id] = parseWindows(
            await stdout(run, ["list-windows", "-t", session.id, "-F", tmuxFormats.windows]),
          );

          await Promise.all(
            windows[session.id].map(async (window) => {
              panes[window.id] = parsePanes(
                await stdout(run, ["list-panes", "-t", window.id, "-F", tmuxFormats.panes]),
              );
            }),
          );
        }),
      );

      return { sessions, windows, panes };
    },

    async createSession(name: string, cwd?: string) {
      validateName(name);
      const args = ["new-session", "-d", "-s", name];

      if (cwd) {
        args.push("-c", cwd);
      }

      await run(args);
      return this.snapshot();
    },

    async killSession(target: string) {
      await run(["kill-session", "-t", sanitizeTarget(target)]);
      return this.snapshot().catch(() => ({ sessions: [], windows: {}, panes: {} }));
    },

    async createWindow(target: string, name?: string) {
      const args = ["new-window", "-t", sanitizeTarget(target)];

      if (name) {
        validateName(name);
        args.push("-n", name);
      }

      await run(args);
      return this.snapshot();
    },

    async killWindow(target: string) {
      await run(["kill-window", "-t", sanitizeTarget(target)]);
      return this.snapshot();
    },

    async splitPane(target: string, direction: "horizontal" | "vertical") {
      const flag = direction === "horizontal" ? "-h" : "-v";
      await run(["split-window", flag, "-t", sanitizeTarget(target)]);
      return this.snapshot();
    },

    async sendInput(target: string, data: string) {
      await run(["send-keys", "-t", sanitizeTarget(target), "-l", data]);
      return { ok: true };
    },

    async sendKeys(target: string, keys: string[]) {
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error("keys must be a non-empty array");
      }

      await run(["send-keys", "-t", sanitizeTarget(target), ...keys]);
      return { ok: true };
    },

    async resizePane(target: string, width: number, height: number) {
      const columns = clampInteger(width, 20, 500);
      const rows = clampInteger(height, 5, 200);
      await run([
        "resize-pane",
        "-t",
        sanitizeTarget(target),
        "-x",
        String(columns),
        "-y",
        String(rows),
      ]);
      return { ok: true, terminal: { columns, rows } };
    },

    async capturePane(target: string, lines = 80): Promise<CaptureResult> {
      const safeTarget = sanitizeTarget(target);
      const safeLines = clampInteger(lines, 1, 5000);
      const [capture, size] = await Promise.all([
        stdout(run, ["capture-pane", "-e", "-p", "-S", `-${safeLines}`, "-t", safeTarget]),
        stdout(run, [
          "display-message",
          "-p",
          "-t",
          safeTarget,
          "#{pane_height}\t#{pane_width}\t#{cursor_y}\t#{cursor_x}",
        ]),
      ]);
      const [rows = "0", columns = "0", cursorRow = "0", cursorColumn = "0"] = size
        .trim()
        .split("\t");

      return {
        target: safeTarget,
        ansi: capture,
        lines: safeLines,
        terminal: {
          rows: Number.parseInt(rows, 10) || 0,
          columns: Number.parseInt(columns, 10) || 0,
          cursorRow: Number.parseInt(cursorRow, 10) || 0,
          cursorColumn: Number.parseInt(cursorColumn, 10) || 0,
        },
      };
    },
  };
}

export async function runTmux(args: string[]): Promise<TmuxCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("tmux", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdoutValue = Buffer.concat(stdoutChunks).toString("utf8");
      const stderrValue = Buffer.concat(stderrChunks).toString("utf8");

      if (code === 0) {
        resolve({ stdout: stdoutValue, stderr: stderrValue });
        return;
      }

      reject(new Error(stderrValue.trim() || `tmux exited with code ${code ?? "unknown"}`));
    });
  });
}

async function stdout(run: TmuxRunner, args: string[]) {
  return (await run(args)).stdout;
}

function validateName(name: string) {
  if (!/^[A-Za-z0-9_.+-]{1,80}$/.test(name)) {
    throw new Error(
      "name must be 1-80 characters and only include letters, numbers, dot, underscore, plus or dash",
    );
  }
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    throw new Error("value must be a finite number");
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
