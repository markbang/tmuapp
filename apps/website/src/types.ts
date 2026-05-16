export type View = "overview" | "manage";
export type AsyncStatus = "idle" | "loading" | "refreshing" | "error";
export type Operation = "refresh" | "create" | "split" | "kill" | "input" | "resize" | "token";

export type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  body?: string;
};

export type PreviewState = {
  text: string;
  status: "loading" | "ready" | "fallback" | "empty";
};

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
