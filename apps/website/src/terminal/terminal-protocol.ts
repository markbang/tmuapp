export type TerminalStreamMessage =
  | { type: "output"; data: string }
  | { type: "error"; message: string }
  | { type: "ping" };

export type TerminalStreamCommand =
  | { type: "input"; data: string }
  | { type: "resize"; columns: number; rows: number };

export function parseTerminalStreamMessage(value: unknown): TerminalStreamMessage | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<TerminalStreamMessage>;
    if (parsed.type === "output" && typeof parsed.data === "string") {
      return { type: "output", data: parsed.data };
    }
    if (parsed.type === "error" && typeof parsed.message === "string") {
      return { type: "error", message: parsed.message };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function isTerminalStreamOpen(socket: WebSocket | undefined): socket is WebSocket {
  return socket?.readyState === WebSocket.OPEN;
}

export function sendTerminalResize(socket: WebSocket | undefined, columns: number, rows: number) {
  sendTerminalCommand(socket, { type: "resize", columns, rows });
}

export function sendTerminalCommand(socket: WebSocket | undefined, command: TerminalStreamCommand) {
  if (isTerminalStreamOpen(socket)) {
    socket.send(JSON.stringify(command));
  }
}

export function normalizeAnsi(ansi: string) {
  // tmux-captured output may use bare \n without \r, which confuses terminals
  // that expect \r\n to move cursor to column 0 before advancing a row.
  // However, some ANSI sequences already include \r (e.g. cursor positioning),
  // so we only add \r before \n that are NOT preceded by \r.
  let result = "";
  for (let i = 0; i < ansi.length; i++) {
    if (ansi[i] === "\n" && (i === 0 || ansi[i - 1] !== "\r")) {
      result += "\r\n";
    } else {
      result += ansi[i];
    }
  }
  return result;
}
