import "@xterm/xterm/css/xterm.css";
import { Button } from "@heroui/react/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TmuxPane, TmuxSnapshot } from "utils";
import "./style.css";
import { apiLabel, request, streamUrl } from "./api/client";
import { InlineLoading } from "./components/InlineLoading";
import { NoticeBanner } from "./components/NoticeBanner";
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
  const [tokenDraft, setTokenDraft] = useState(() => "");
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
      const term = await ensureTerminal(pane?.width, pane?.height);
      if (!term) return;

      term.reset();
      setTerminalStatus("loading");
      await resizeActivePane(paneId, term.cols, term.rows, setOperation, setFitSize);

      const socket = new WebSocket(streamUrl(`/api/panes/${encodeURIComponent(paneId)}/stream`));
      let receivedOutput = false;
      const fallbackTimer = window.setTimeout(() => {
        if (!receivedOutput && terminalStream.current === socket) {
          socket.close();
          terminalStream.current = undefined;
          streamedPane.current = undefined;
          void refreshActivePane(paneId);
        }
      }, 3000);
      terminalStream.current = socket;
      streamedPane.current = paneId;

      socket.addEventListener("open", () => {
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
          void refreshActivePane(paneId);
          return;
        }
        setTerminalStatus("error");
        setNotice({ tone: "danger", title: "Terminal stream failed", body: apiLabel });
      });

      socket.addEventListener("close", () => {
        window.clearTimeout(fallbackTimer);
        if (terminalStream.current === socket) terminalStream.current = undefined;
      });
    },
    [ensureTerminal, refreshActivePane, renderTerminalText, selection.pane, snapshot, view],
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

  const openSession = useCallback(
    (sessionId: string) => {
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

  const saveApiToken = useCallback(() => {
    import("./api/client").then(({ apiTokenStorageKey }) => {
      if (tokenDraft.trim()) {
        localStorage.setItem(apiTokenStorageKey, tokenDraft.trim());
        setNotice({ tone: "success", title: "API Token Saved" });
      } else {
        localStorage.removeItem(apiTokenStorageKey);
        setNotice({ tone: "neutral", title: "API Token Cleared" });
      }
      setShowTokenSettings(false);
      void refresh("background");
    });
  }, [refresh, tokenDraft]);

  useEffect(() => {
    void refresh("initial");
  }, []);

  useEffect(() => {
    if (view !== "manage") {
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

    void Promise.all(
      snapshot.sessions.map(async (session) => {
        const pane = firstPaneForSession(snapshot, session.id);
        if (!pane) {
          return [
            session.id,
            { text: "No panes", status: "empty" } satisfies PreviewState,
          ] as const;
        }

        try {
          const capture = await request<CaptureResult>(
            `/api/panes/${encodeURIComponent(pane.id)}/capture?lines=8`,
          );
          return [
            session.id,
            { text: previewText(capture.ansi), status: "ready" } satisfies PreviewState,
          ] as const;
        } catch {
          return [
            session.id,
            {
              text: pane.currentCommand || pane.currentPath || pane.id,
              status: "fallback",
            } satisfies PreviewState,
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled || run !== previewRun) return;
      setSessionPreviews((current) => ({ ...current, ...Object.fromEntries(entries) }));
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

        {view === "overview" ? (
          <SessionGrid
            status={status}
            sessions={sessions}
            snapshot={snapshot}
            selectedSession={selection.session}
            previews={sessionPreviews}
            isCreating={operation === "create"}
            onRetry={() => void refresh("manual")}
            onCreate={() => void createSession()}
            onDelete={(id) => void deleteSession(id)}
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
                role="tabpanel"
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

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(<App />);
