import "@xterm/xterm/css/xterm.css";
import { Button } from "@heroui/react/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TmuxPane, TmuxSnapshot } from "utils";
import "./style.css";
import { apiLabel, apiTokenStorageKey, request, streamUrl } from "./api/client";
import { detectAgentState } from "./agent-detector";
import { InlineLoading } from "./components/InlineLoading";
import { NoticeBanner } from "./components/NoticeBanner";
import { ConfirmSessionDelete } from "./components/ConfirmSessionDelete";
import { SessionGrid } from "./components/SessionGrid";
import { TokenPanel } from "./components/TokenPanel";
import {
  fitTerminalToContainer,
  type TerminalCellMetrics,
  waitForLayout,
} from "./terminal/terminal-fit";
import { createTerminal, type TermAdapter } from "./terminal/terminal-adapter";
import {
  isTerminalStreamOpen,
  normalizeAnsi,
  parseTerminalStreamMessage,
  sendTerminalCommand,
  sendTerminalResize,
} from "./terminal/terminal-protocol";
import {
  followTerminalOutput,
  isScrolledNearTop,
  isScrolledToBottom,
  scrollTerminalToBottomIfFollowing,
} from "./terminal/terminal-scroll";
import {
  currentSession,
  defaultSessionName,
  firstPaneForSession,
  message,
  previewText,
  reconcileSelection,
  type Selection,
} from "./tmux-helpers";
import type { AsyncStatus, CaptureResult, Notice, Operation, PreviewState, View } from "./types";

function App() {
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState<TmuxSnapshot>();
  const [selection, setSelection] = useState<Selection>({});
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [terminalStatus, setTerminalStatus] = useState<AsyncStatus>("idle");
  const [notice, setNotice] = useState<Notice>();
  const [operation, setOperation] = useState<Operation>();
  const [showTokenSettings, setShowTokenSettings] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | undefined>();
  const [tokenDraft, setTokenDraft] = useState(
    () => localStorage.getItem(apiTokenStorageKey) ?? "",
  );
  const [previewRun, setPreviewRun] = useState(0);
  const [sessionPreviews, setSessionPreviews] = useState<Record<string, PreviewState>>({});
  const [, setFitSize] = useState("pending");

  const terminalElement = useRef<HTMLDivElement | null>(null);
  const terminal = useRef<TermAdapter | undefined>(undefined);
  const terminalReady = useRef<Promise<void> | undefined>(undefined);
  const terminalDataHandler = useRef<(data: string) => void>(() => {});
  const terminalShouldFollow = useRef(true);
  const resizeScheduler = useRef<(columns: number, rows: number) => void>(() => {});
  const terminalStream = useRef<WebSocket | undefined>(undefined);
  const streamedPane = useRef<string | undefined>(undefined);
  const resizeTimer = useRef<number | undefined>(undefined);
  const lastResize = useRef<string | undefined>(undefined);
  const terminalCellMetrics = useRef<TerminalCellMetrics | undefined>(undefined);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previewConcurrencyRef = useRef(0);

  const sessions = snapshot?.sessions ?? [];
  const selectedSession = currentSession(snapshot, selection.session);

  const applySnapshot = useCallback(
    (nextSnapshot: TmuxSnapshot, preferred: Selection = selection) => {
      const nextSelection = reconcileSelection(nextSnapshot, preferred);
      setSnapshot(nextSnapshot);
      setSelection(nextSelection);
      if (view === "manage" && !nextSelection.session) {
        setView("overview");
      }
      return nextSelection;
    },
    [selection, view],
  );

  const scheduleResizeActivePane = useCallback((columns: number, rows: number) => {
    resizeScheduler.current(columns, rows);
  }, []);

  const ensureTerminal = useCallback(
    async (columns = 120, rows = 34) => {
      if (!terminal.current) {
        const element = terminalElement.current;
        if (!element) return undefined;

        terminal.current = createTerminal(element, {
          cols: columns || 120,
          cursorBlink: true,
          rows: rows || 34,
          onData: (data) => terminalDataHandler.current(data),
          onResize: scheduleResizeActivePane,
        });
        terminalReady.current = terminal.current.init();
      }

      await terminalReady.current;
      const viewport = terminal.current?.element.querySelector<HTMLElement>(".xterm-viewport");
      if (viewport && !viewport.hasAttribute("data-scroll-listener")) {
        viewport.setAttribute("data-scroll-listener", "1");
        viewport.addEventListener("scroll", () => {
          if (isScrolledNearTop(viewport)) {
            terminalShouldFollow.current = false;
            return;
          }
          if (isScrolledToBottom(viewport)) {
            terminalShouldFollow.current = true;
          }
        });
      }
      await waitForLayout();
      fitTerminalToContainer(terminal.current, terminalCellMetrics);
      setFitSize(`${terminal.current.cols}x${terminal.current.rows}`);
      scheduleResizeActivePane(terminal.current.cols, terminal.current.rows);
      terminal.current.focus();
      return terminal.current;
    },
    [scheduleResizeActivePane],
  );

  const renderTerminal = useCallback(
    async (capture: CaptureResult) => {
      const term = await ensureTerminal(capture.terminal.columns, capture.terminal.rows);
      if (!term) return;

      const shouldFollow = terminalShouldFollow.current;
      term.reset();
      term.write(normalizeAnsi(capture.ansi));
      scrollTerminalToBottomIfFollowing(term.element, shouldFollow);
    },
    [ensureTerminal],
  );

  const renderTerminalText = useCallback(
    (text: string) => {
      void renderTerminal({
        target: selection.pane ?? "",
        ansi: text,
        lines: text.split("\n").length,
        terminal: { rows: 34, columns: 120, cursorRow: 0, cursorColumn: 0 },
      });
    },
    [renderTerminal, selection.pane],
  );

  const refreshActivePane = useCallback(
    async (paneId = selection.pane) => {
      if (view !== "manage") return;
      if (!paneId) {
        renderTerminalText("No tmux window selected. Create or open a window to begin.");
        return;
      }

      setTerminalStatus("refreshing");
      try {
        const capture = await request<CaptureResult>(
          `/api/panes/${encodeURIComponent(paneId)}/capture?lines=240`,
        );
        await renderTerminal(capture);
        setTerminalStatus("idle");
      } catch (error) {
        setTerminalStatus("error");
        renderTerminalText(`Unable to capture pane ${paneId}\n${message(error)}`);
        setNotice({ tone: "danger", title: "Pane capture failed", body: message(error) });
      }
    },
    [renderTerminal, renderTerminalText, selection.pane, view],
  );

  resizeScheduler.current = (columns: number, rows: number) => {
    if (!selection.pane || view !== "manage") return;

    const key = `${columns}x${rows}`;
    if (lastResize.current === key) return;
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current);

    const paneId = selection.pane;
    const nextSelection = { ...selection, pane: paneId };
    resizeTimer.current = window.setTimeout(() => {
      resizeTimer.current = undefined;
      lastResize.current = key;
      sendTerminalResize(terminalStream.current, columns, rows);
      void (async () => {
        await resizeActivePane(paneId, columns, rows, setOperation, setFitSize);
        try {
          const nextSnapshot = await request<TmuxSnapshot>("/api/sessions");
          applySnapshot(nextSnapshot, nextSelection);
        } catch {
          // Resize succeeded; a later refresh will reconcile metadata.
        }
        if (terminalShouldFollow.current) await refreshActivePane(paneId);
      })();
    }, 150);
  };

  const connectTerminalStream = useCallback(
    async (paneId = selection.pane) => {
      if (view !== "manage") return;

      terminalStream.current?.close();
      terminalStream.current = undefined;
      streamedPane.current = undefined;

      if (!paneId) {
        renderTerminalText("No tmux window selected. Create or open a window to begin.");
        return;
      }

      const pane = findPane(snapshot, paneId);
      const terminalInstance = await ensureTerminal(pane?.width, pane?.height);
      if (!terminalInstance) return;

      terminalInstance.reset();
      setTerminalStatus("loading");
      await resizeActivePane(
        paneId,
        terminalInstance.cols,
        terminalInstance.rows,
        setOperation,
        setFitSize,
      );

      connectWebSocket(paneId, terminalInstance);
    },
    [ensureTerminal, refreshActivePane, renderTerminalText, selection.pane, snapshot, view],
  );

  // WebSocket reconnect state
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | undefined>(undefined);

  const connectWebSocket = useCallback(
    (paneId: string, term: TermAdapter, isReconnect = false) => {
      if (!isReconnect) {
        reconnectAttemptRef.current = 0;
        window.clearTimeout(reconnectTimerRef.current);
      }

      const socket = new WebSocket(streamUrl(`/api/panes/${encodeURIComponent(paneId)}/stream`));
      let receivedOutput = false;
      const fallbackTimer = window.setTimeout(() => {
        if (!receivedOutput && terminalStream.current === socket) {
          socket.close();
          terminalStream.current = undefined;
          streamedPane.current = undefined;
          if (!isReconnect) void refreshActivePane(paneId);
        }
      }, 3000);
      terminalStream.current = socket;
      streamedPane.current = paneId;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setTerminalStatus("idle");
        sendTerminalResize(socket, term.cols, term.rows);
      });

      socket.addEventListener("message", (event) => {
        const payload = parseTerminalStreamMessage(event.data);
        if (!payload) return;

        if (payload.type === "output") {
          receivedOutput = true;
          window.clearTimeout(fallbackTimer);
          setTerminalStatus("idle");
          const shouldFollow = terminalShouldFollow.current;
          term.write(normalizeAnsi(payload.data));
          scrollTerminalToBottomIfFollowing(term.element, shouldFollow);
          return;
        }

        if (payload.type === "ping") return;

        if (!receivedOutput) {
          window.clearTimeout(fallbackTimer);
          socket.close();
          if (terminalStream.current === socket) {
            terminalStream.current = undefined;
            streamedPane.current = undefined;
          }
          void refreshActivePane(paneId);
          return;
        }

        setTerminalStatus("error");
        setNotice({ tone: "danger", title: "Terminal stream failed", body: payload.message });
      });

      socket.addEventListener("error", () => {
        window.clearTimeout(fallbackTimer);
        if (!receivedOutput) {
          terminalStream.current = undefined;
          streamedPane.current = undefined;
          if (!isReconnect) void refreshActivePane(paneId);
          return;
        }
        setTerminalStatus("error");
        setNotice({ tone: "danger", title: "Terminal stream failed", body: apiLabel });
      });

      socket.addEventListener("close", () => {
        window.clearTimeout(fallbackTimer);
        if (terminalStream.current !== socket) return;
        terminalStream.current = undefined;

        if (receivedOutput && reconnectAttemptRef.current < 5) {
          reconnectAttemptRef.current += 1;
          const delay = Math.min(1000 * 2 ** (reconnectAttemptRef.current - 1), 30_000);
          setTerminalStatus("refreshing");
          setNotice({
            tone: "warning",
            title: `Reconnecting… (${reconnectAttemptRef.current}/5)`,
          });
          reconnectTimerRef.current = window.setTimeout(async () => {
            setNotice(undefined);
            await refreshActivePane(paneId);
            connectWebSocket(paneId, term, true);
          }, delay);
        }
      });
    },
    [refreshActivePane],
  );

  const refresh = useCallback(
    async (mode: "initial" | "manual" | "background" = "manual") => {
      setStatus(mode === "initial" ? "loading" : "refreshing");
      setOperation(mode === "manual" ? "refresh" : undefined);
      try {
        const nextSnapshot = await request<TmuxSnapshot>("/api/sessions");
        const nextSelection = applySnapshot(nextSnapshot);
        setStatus("idle");
        if (mode === "manual") setNotice({ tone: "success", title: "Sessions refreshed" });
        if (view === "manage") await connectTerminalStream(nextSelection.pane);
        else setPreviewRun((run) => run + 1);
      } catch (error) {
        setStatus("error");
        if (view === "manage") {
          setNotice({
            tone: "danger",
            title: "Unable to reach tmux API",
            body: `${apiLabel}: ${message(error)}`,
          });
          renderTerminalText(`Unable to reach API at ${apiLabel}\n${message(error)}`);
        }
      } finally {
        setOperation(undefined);
      }
    },
    [applySnapshot, connectTerminalStream, renderTerminalText, view],
  );

  const sendTerminalData = useCallback(
    async (data: string) => {
      if (!selection.pane || data.length === 0) return;

      followTerminalOutput(terminalElement.current, terminalShouldFollow);
      const stream = terminalStream.current;
      if (isTerminalStreamOpen(stream)) {
        sendTerminalCommand(stream, { type: "input", data });
        return;
      }

      setOperation("input");
      try {
        await request(`/api/panes/${encodeURIComponent(selection.pane)}/input`, {
          method: "POST",
          body: { data },
        });
        await refreshActivePane(selection.pane);
      } catch (error) {
        setNotice({ tone: "danger", title: "Terminal input failed", body: message(error) });
      } finally {
        setOperation(undefined);
      }
    },
    [refreshActivePane, selection.pane],
  );

  useEffect(() => {
    terminalDataHandler.current = (data) => void sendTerminalData(data);
  }, [sendTerminalData]);

  const createSession = useCallback(async () => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const name = defaultSessionName();
    setOperation("create");
    try {
      const nextSnapshot = await request<TmuxSnapshot>("/api/sessions", {
        method: "POST",
        body: { name },
      });
      const createdSession = nextSnapshot.sessions.find((session) => session.name === name);
      const nextSelection = applySnapshot(nextSnapshot, { session: createdSession?.id });
      setNotice({ tone: "success", title: "Session created", body: name });
      setTerminalStatus("loading");
      setView("manage");
      void connectTerminalStream(nextSelection.pane);
    } catch (error) {
      setNotice({ tone: "danger", title: "Unable to create session", body: message(error) });
    } finally {
      setOperation(undefined);
    }
  }, [applySnapshot, connectTerminalStream]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setOperation("kill");
      try {
        await request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
        setNotice({ tone: "success", title: "Session deleted" });
        const nextSnapshot = await request<TmuxSnapshot>("/api/sessions");
        applySnapshot(nextSnapshot, {});
        setPreviewRun((run) => run + 1);
      } catch (error) {
        setNotice({ tone: "danger", title: "Unable to delete session", body: message(error) });
      } finally {
        setOperation(undefined);
      }
    },
    [applySnapshot],
  );

  const requestDeleteSession = useCallback((sessionId: string) => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSessionToDelete(sessionId);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;
    const sessionId = sessionToDelete;
    setSessionToDelete(undefined);
    await deleteSession(sessionId);
  }, [deleteSession, sessionToDelete]);

  const openSession = useCallback(
    (sessionId: string) => {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const nextSelection = reconcileSelection(snapshot, { session: sessionId });
      setSelection(nextSelection);
      setView("manage");
      setTerminalStatus("loading");
      void connectTerminalStream(nextSelection.pane);
    },
    [connectTerminalStream, snapshot],
  );

  const showOverview = useCallback(() => {
    setView("overview");
    setPreviewRun((run) => run + 1);
  }, []);

  const configureApiToken = useCallback(() => {
    setTokenDraft(localStorage.getItem(apiTokenStorageKey) ?? "");
    setShowTokenSettings(true);
  }, []);

  const saveApiToken = useCallback(() => {
    if (tokenDraft.trim()) {
      localStorage.setItem(apiTokenStorageKey, tokenDraft.trim());
      setNotice({ tone: "success", title: "API Token Saved" });
    } else {
      localStorage.removeItem(apiTokenStorageKey);
      setNotice({ tone: "neutral", title: "API Token Cleared" });
    }
    setShowTokenSettings(false);
    void refresh("background");
  }, [refresh, tokenDraft]);

  useEffect(() => {
    void refresh("initial");
  }, []);

  useEffect(() => {
    if (view !== "manage") {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
      reconnectAttemptRef.current = 0;
      terminalStream.current?.close();
      terminalStream.current = undefined;
      streamedPane.current = undefined;
      terminal.current?.dispose();
      terminal.current = undefined;
      terminalReady.current = undefined;
      terminalCellMetrics.current = undefined;
      return;
    }

    if (selection.pane && streamedPane.current !== selection.pane) {
      void connectTerminalStream(selection.pane);
    }
  }, [connectTerminalStream, selection.pane, view]);

  useEffect(() => {
    if (view !== "overview") return;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!target) return;
    requestAnimationFrame(() => target.focus());
  }, [view]);

  useEffect(() => {
    const fitTerminal = () => {
      if (terminal.current && selection.pane && view === "manage") {
        fitTerminalToContainer(terminal.current, terminalCellMetrics);
        setFitSize(`${terminal.current.cols}x${terminal.current.rows}`);
        scheduleResizeActivePane(terminal.current.cols, terminal.current.rows);
      }
    };

    window.addEventListener("resize", fitTerminal);
    return () => window.removeEventListener("resize", fitTerminal);
  }, [scheduleResizeActivePane, selection.pane, view]);

  useEffect(() => {
    return () => terminalStream.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (view !== "overview" || !snapshot) return;

    let cancelled = false;
    const run = previewRun;
    setSessionPreviews((current) => {
      const next = { ...current };
      for (const session of snapshot.sessions) {
        next[session.id] ??= { text: "Loading preview…", status: "loading" };
      }
      return next;
    });

    const queue = [...snapshot.sessions];
    const nextEntries: Array<readonly [string, PreviewState]> = [];
    const limit = 3;

    const pump = async () => {
      while (!cancelled && queue.length > 0) {
        const session = queue.shift();
        if (!session) continue;

        const pane = firstPaneForSession(snapshot, session.id);
        if (!pane) {
          nextEntries.push([session.id, { text: "No panes", status: "empty" } satisfies PreviewState]);
          continue;
        }

        try {
          const capture = await request<CaptureResult>(
            `/api/panes/${encodeURIComponent(pane.id)}/capture?lines=8`,
          );
          nextEntries.push([
            session.id,
            { text: previewText(capture.ansi), status: "ready" } satisfies PreviewState,
          ]);
        } catch {
          nextEntries.push([
            session.id,
            {
              text: pane.currentCommand || pane.currentPath || pane.id,
              status: "fallback",
            } satisfies PreviewState,
          ]);
        }
      }
    };

    const workers = Array.from({ length: Math.min(limit, snapshot.sessions.length) }, async () => {
      previewConcurrencyRef.current += 1;
      try {
        await pump();
      } finally {
        previewConcurrencyRef.current -= 1;
      }
    });

    void Promise.all(workers).then(() => {
      if (cancelled || run !== previewRun) return;
      setSessionPreviews((current) => ({ ...current, ...Object.fromEntries(nextEntries) }));
    });

    return () => {
      cancelled = true;
    };
  }, [previewRun, snapshot, view]);

  return (
    <div className="app-shell">
      <main id="main-content" className="workspace">
        {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(undefined)} /> : null}
        {showTokenSettings ? (
          <TokenPanel
            token={tokenDraft}
            onCancel={() => setShowTokenSettings(false)}
            onSave={saveApiToken}
            onTokenChange={setTokenDraft}
          />
        ) : null}

        {sessionToDelete ? (
          <ConfirmSessionDelete
            isDeleting={operation === "kill"}
            sessionName={snapshot?.sessions.find((session) => session.id === sessionToDelete)?.name ?? sessionToDelete}
            onCancel={() => setSessionToDelete(undefined)}
            onConfirm={() => void confirmDeleteSession()}
          />
        ) : null}

        {view === "overview" ? (
          <SessionGrid
            status={status}
            sessions={sessions}
            snapshot={snapshot}
            selectedSession={selection.session}
            previews={sessionPreviews}
            isCreating={operation === "create"}
            onConfigureToken={configureApiToken}
            onRetry={() => void refresh("manual")}
            onCreate={() => void createSession()}
            onDelete={(id) => requestDeleteSession(id)}
            onOpen={openSession}
          />
        ) : null}

        {view === "manage" ? (
          <section className="terminal-window" aria-label="Tmux terminal">
            <header className="terminal-header">
              <div className="terminal-header-left">
                <Button className="terminal-back-button" type="button" onPress={showOverview}>
                  <span aria-hidden="true">‹</span>
                  BACK
                </Button>
                <div className="terminal-header-divider" />
                <div className="terminal-title-group">
                  <span className="online-dot" aria-hidden="true" />
                  <span className="terminal-title">Tmux Terminal</span>
                </div>
              </div>
              <div className="terminal-session-id">
                <span>Session:</span> {selectedSession?.id ?? selection.session ?? "unknown"}
              </div>
            </header>
            <div className="terminal-body">
              <div
                className={`terminal-wrap${terminalStatus === "loading" ? " switching" : ""}`}
                id="terminal-panel"
              >
                {terminalStatus === "loading" ? (
                  <InlineLoading label="Preparing terminal…" />
                ) : null}
                <div
                  ref={terminalElement}
                  id="terminal"
                  className="terminal"
                  aria-label="tmux pane terminal"
                />
              </div>
            </div>
            {(() => {
              const pane = findPane(snapshot, selection.pane);
              const preview = sessionPreviews[selection.session ?? ""];
              const detected = detectAgentState(pane?.currentCommand ?? "", preview?.text ?? "");
              if (detected.state !== "waiting_input" && detected.state !== "unknown") return null;
              return (
                <div className="quick-reply-bar">
                  <QuickReplyButton
                    label="Y"
                    title="Send 'y'"
                    onPress={() => void sendTerminalData("y")}
                  />
                  <QuickReplyButton
                    label="N"
                    title="Send 'n'"
                    onPress={() => void sendTerminalData("n")}
                  />
                  <QuickReplyButton
                    label="↵"
                    title="Send Enter"
                    onPress={() => void sendTerminalData("\r")}
                  />
                  <QuickReplyButton
                    label="^C"
                    title="Send Ctrl+C"
                    onPress={() => void sendTerminalData("\x03")}
                  />
                  <QuickReplyButton
                    label="^D"
                    title="Send Ctrl+D"
                    onPress={() => void sendTerminalData("\x04")}
                  />
                </div>
              );
            })()}
          </section>
        ) : null}
      </main>
    </div>
  );
}

async function resizeActivePane(
  paneId: string,
  columns: number,
  rows: number,
  setOperation: (operation: Operation | undefined) => void,
  setFitSize: (fit: string) => void,
) {
  const key = `${columns}x${rows}`;
  setOperation("resize");
  setFitSize(key);
  try {
    await request(`/api/panes/${encodeURIComponent(paneId)}/resize`, {
      method: "POST",
      body: { width: columns, height: rows },
    });
  } finally {
    setOperation(undefined);
  }
}

function findPane(
  snapshot: TmuxSnapshot | undefined,
  paneId: string | undefined,
): TmuxPane | undefined {
  if (!snapshot || !paneId) return undefined;
  for (const panes of Object.values(snapshot.panes)) {
    const pane = panes.find((item) => item.id === paneId);
    if (pane) return pane;
  }
  return undefined;
}

function QuickReplyButton(props: { label: string; title: string; onPress: () => void }) {
  return (
    <button className="quick-reply-btn" type="button" title={props.title} onClick={props.onPress}>
      {props.label}
    </button>
  );
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(<App />);
