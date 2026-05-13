import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { runTmux, type TmuxRunner } from "./tmux.js";

export type TmuxStream = {
  close: () => void;
};

export type TmuxStreamRunner = (args: string[]) => ChildProcessWithoutNullStreams;

export function createTmuxStream(
  target: string,
  callbacks: {
    onData: (data: string) => void;
    onError: (message: string) => void;
    onClose: () => void;
  },
  options: { runCommand?: TmuxRunner; runStream?: TmuxStreamRunner } = {},
): TmuxStream {
  const runCommand = options.runCommand ?? runTmux;
  const runStream = options.runStream ?? spawnTmuxStream;
  const control = runStream(["-C", "attach-session", "-t", target]);
  let stdoutBuffer = "";
  let closed = false;

  void sendInitialCapture(target, runCommand, callbacks.onData, callbacks.onError);

  control.stdout.setEncoding("utf8");
  control.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      handleControlLine(line.replace(/\r$/u, ""), callbacks.onData);
    }
  });

  control.stderr.setEncoding("utf8");
  control.stderr.on("data", (chunk: string) => {
    const message = chunk.trim();
    if (message) {
      callbacks.onError(message);
    }
  });

  control.on("error", (error) => callbacks.onError(error.message));
  control.on("close", () => {
    if (!closed) {
      closed = true;
      callbacks.onClose();
    }
  });

  return {
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      closeControl(control);
    },
  };
}

async function sendInitialCapture(
  target: string,
  runCommand: TmuxRunner,
  onData: (data: string) => void,
  onError: (message: string) => void,
) {
  try {
    const { stdout } = await runCommand(["capture-pane", "-e", "-p", "-S", "-240", "-t", target]);
    if (stdout) {
      onData(trimTrailingBlankLines(stdout).replaceAll("\n", "\r\n"));
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

function trimTrailingBlankLines(value: string) {
  return value.replace(/(?:\r?\n[ \t]*)+$/u, "");
}

function handleControlLine(line: string, onData: (data: string) => void) {
  if (!line.startsWith("%output ")) {
    return;
  }

  const firstSpace = line.indexOf(" ", "%output ".length);
  if (firstSpace === -1) {
    return;
  }

  onData(decodeTmuxControlOutput(line.slice(firstSpace + 1)));
}

function decodeTmuxControlOutput(value: string) {
  return value.replace(/\\([0-7]{3}|.)/gu, (_match, escaped: string) => {
    if (/^[0-7]{3}$/u.test(escaped)) {
      return String.fromCharCode(Number.parseInt(escaped, 8));
    }

    switch (escaped) {
      case "e":
        return "\u001b";
      case "r":
        return "\r";
      case "n":
        return "\n";
      case "t":
        return "\t";
      default:
        return escaped;
    }
  });
}

function spawnTmuxStream(args: string[]) {
  return spawn("tmux", args, { stdio: ["pipe", "pipe", "pipe"] });
}

function closeControl(control: ChildProcessWithoutNullStreams) {
  if (control.stdin.writable) {
    control.stdin.end("detach-client\n");
  }

  const killTimer = setTimeout(() => control.kill(), 500);
  control.once("close", () => clearTimeout(killTimer));
}
