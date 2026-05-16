import type { TmuxPane, TmuxSnapshot, TmuxWindow } from "utils";

export type Selection = {
  session?: string;
  window?: string;
  pane?: string;
};

export function reconcileSelection(
  snapshot: TmuxSnapshot | undefined,
  current: Selection,
): Selection {
  const sessions = snapshot?.sessions ?? [];
  const sessionIds = sessions.map((session) => session.id);
  const session = chooseExisting(current.session, sessionIds) ?? sessions[0]?.id;
  const windows = session && snapshot ? (snapshot.windows[session] ?? []) : [];
  const windowIds = windows.map((window) => window.id);
  const window =
    chooseExisting(current.window, windowIds) ?? activeOrFirstWindow(snapshot, session)?.id;
  const panes = window && snapshot ? (snapshot.panes[window] ?? []) : [];
  const paneIds = panes.map((pane) => pane.id);
  const pane = chooseExisting(current.pane, paneIds) ?? activeOrFirstPane(snapshot, window)?.id;

  return { session, window, pane };
}

export function currentSession(snapshot: TmuxSnapshot | undefined, sessionId: string | undefined) {
  return snapshot?.sessions.find((session) => session.id === sessionId);
}

export function currentWindows(
  snapshot: TmuxSnapshot | undefined,
  sessionId: string | undefined,
): TmuxWindow[] {
  return sessionId && snapshot ? (snapshot.windows[sessionId] ?? []) : [];
}

export function currentPanes(
  snapshot: TmuxSnapshot | undefined,
  windowId: string | undefined,
): TmuxPane[] {
  return windowId && snapshot ? (snapshot.panes[windowId] ?? []) : [];
}

export function panesForSession(snapshot: TmuxSnapshot | undefined, sessionId: string): TmuxPane[] {
  const windows = snapshot?.windows[sessionId] ?? [];
  return windows.flatMap((window) => snapshot?.panes[window.id] ?? []);
}

export function activeOrFirstWindow(
  snapshot: TmuxSnapshot | undefined,
  sessionId: string | undefined,
): TmuxWindow | undefined {
  const windows = sessionId && snapshot ? (snapshot.windows[sessionId] ?? []) : [];
  return windows.find((window) => window.active) ?? windows[0];
}

export function activeOrFirstPane(
  snapshot: TmuxSnapshot | undefined,
  windowId: string | undefined,
): TmuxPane | undefined {
  const panes = windowId && snapshot ? (snapshot.panes[windowId] ?? []) : [];
  return panes.find((pane) => pane.active) ?? panes[0];
}

export function firstPaneForSession(
  snapshot: TmuxSnapshot | undefined,
  sessionId: string,
): TmuxPane | undefined {
  const window = activeOrFirstWindow(snapshot, sessionId);
  return activeOrFirstPane(snapshot, window?.id);
}

export function chooseExisting(current: string | undefined, candidates: string[]) {
  return current && candidates.includes(current) ? current : undefined;
}

const ansiPattern = new RegExp(
  String.raw`[\x1b\x9b][[\]\()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))`,
  "g",
);

export function stripAnsi(value: string) {
  return value.replace(ansiPattern, "");
}

export function previewText(ansi: string) {
  const text = stripAnsi(ansi)
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-5)
    .join("\n");

  return text || "No output";
}

export function windowTabId(windowId: string) {
  return `window-tab-${windowId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function defaultSessionName() {
  return `work-${Math.floor(Date.now() / 1000)}`;
}
