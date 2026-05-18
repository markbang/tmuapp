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
      const sessions = await listSessions(run);
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
      await run(buildSendKeysArgs(sanitizeTarget(target), data));
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
      const safeTarget = sanitizeTarget(target);
      await run(["resize-window", "-t", safeTarget, "-x", String(columns), "-y", String(rows)]);
      await run(["resize-pane", "-t", safeTarget, "-x", String(columns), "-y", String(rows)]);
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

async function listSessions(run: TmuxRunner) {
  try {
    return parseSessions(await stdout(run, ["list-sessions", "-F", tmuxFormats.sessions]));
  } catch (error) {
    if (isNoTmuxServer(error)) {
      return [];
    }

    throw error;
  }
}

function isNoTmuxServer(error: unknown) {
  return (
    error instanceof Error &&
    (/no server running/u.test(error.message) ||
      /error connecting to .*\(No such file or directory\)/u.test(error.message))
  );
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

/**
 * Build tmux send-keys arguments. For single control characters (codes
 * 0x00–0x1f and 0x7f) we use tmux key names (C-a, C-c, Enter, Tab, Escape,
 * BSpace) so that the terminal driver and/or the foreground process receive a
 * proper signal / escape sequence rather than a bare literal byte.  In raw
 * terminal mode (e.g. pi, vim) bare control bytes are read as data and do
 * NOT generate SIGINT / EOF / etc.
 *
 * For multi-byte data and printable characters we keep the `-l` (literal)
 * flag so that sequences like `\x1b[A` (arrow-up) are forwarded correctly.
 */
export function buildSendKeysArgs(target: string, data: string): string[] {
  if (data.length === 1) {
    const code = data.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      const keyName = CONTROL_KEY_NAMES.get(code);
      if (keyName) return ["send-keys", "-t", target, keyName];
    }
  }
  return ["send-keys", "-t", target, "-l", data];
}

const CONTROL_KEY_NAMES: ReadonlyMap<number, string> = new Map([
  [0x01, "C-a"],
  [0x02, "C-b"],
  [0x03, "C-c"],
  [0x04, "C-d"],
  [0x05, "C-e"],
  [0x06, "C-f"],
  [0x07, "C-g"],
  [0x08, "BSpace"],
  [0x09, "Tab"],
  [0x0b, "C-k"],
  [0x0c, "C-l"],
  [0x0d, "Enter"],
  [0x0e, "C-n"],
  [0x0f, "C-o"],
  [0x10, "C-p"],
  [0x11, "C-q"],
  [0x12, "C-r"],
  [0x13, "C-s"],
  [0x14, "C-t"],
  [0x15, "C-u"],
  [0x16, "C-v"],
  [0x17, "C-w"],
  [0x18, "C-x"],
  [0x19, "C-y"],
  [0x1a, "C-z"],
  [0x1b, "Escape"],
  [0x1c, "C-\\"],
  [0x1d, "C-]"],
  [0x1e, "C-^"],
  [0x1f, "C-_"],
  [0x7f, "BSpace"],
]);
