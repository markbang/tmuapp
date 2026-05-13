import "@wterm/dom/css";
import { WTerm } from "@wterm/dom";
import { Alert, Button, Card, Chip, Input, Spinner } from "@heroui/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type TmuxPane, type TmuxSession, type TmuxSnapshot, type TmuxWindow } from "utils";
import "./style.css";

type CaptureResult = {
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

type View = "overview" | "manage";
type AsyncStatus = "idle" | "loading" | "refreshing" | "error";
type Operation = "refresh" | "create" | "split" | "kill" | "input" | "resize" | "token";

type Selection = {
  session?: string;
  window?: string;
  pane?: string;
};

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  body?: string;
};

type PreviewState = {
  text: string;
  status: "loading" | "ready" | "fallback" | "empty";
};

type TerminalStreamMessage = { type: "output"; data: string } | { type: "error"; message: string };

type TerminalStreamCommand =
  | { type: "input"; data: string }
  | { type: "resize"; columns: number; rows: number };

const apiBase = import.meta.env.VITE_API_BASE ?? "";
const configuredToken = import.meta.env.VITE_TMUAPP_TOKEN as string | undefined;
const apiTokenStorageKey = "tmuapp.apiToken";
const apiLabel = apiBase || "same-origin / Vite proxy";

function App() {
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState<TmuxSnapshot>();
  const [selection, setSelection] = useState<Selection>({});
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [terminalStatus, setTerminalStatus] = useState<AsyncStatus>("idle");
  const [notice, setNotice] = useState<Notice>();
  const [operation, setOperation] = useState<Operation>();
  const [inputValue, setInputValue] = useState("");
  const [newSessionName, setNewSessionName] = useState(defaultSessionName);
  const [newSessionCwd, setNewSessionCwd] = useState("");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [previewRun, setPreviewRun] = useState(0);
  const [sessionPreviews, setSessionPreviews] = useState<Record<string, PreviewState>>({});
  const [fitSize, setFitSize] = useState("pending");

  const terminalElement = useRef<HTMLDivElement | null>(null);
  const terminal = useRef<WTerm | undefined>(undefined);
  const terminalReady = useRef<Promise<WTerm> | undefined>(undefined);
  const terminalDataHandler = useRef<(data: string) => void>(() => {});
  const terminalStream = useRef<WebSocket | undefined>(undefined);
  const streamedPane = useRef<string | undefined>(undefined);
  const resizeTimer = useRef<number | undefined>(undefined);
  const lastResize = useRef<string | undefined>(undefined);
  const terminalUserScrolled = useRef(false);

  const sessions = snapshot?.sessions ?? [];
  const selectedSession = currentSession(snapshot, selection.session);
  const windows = currentWindows(snapshot, selection.session);
  const panes = currentPanes(snapshot, selection.window);
  const selectedPane = panes.find((pane) => pane.id === selection.pane);
  const totalWindows = sessions.reduce(
    (count, session) => count + (snapshot?.windows[session.id]?.length ?? 0),
    0,
  );
  const totalPanes = sessions.reduce(
    (count, session) => count + panesForSession(snapshot, session.id).length,
    0,
  );

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

  const scheduleResizeActivePane = useCallback(
    (columns: number, rows: number) => {
      if (!selection.pane || view !== "manage") {
        return;
      }

      const key = `${columns}x${rows}`;
      if (lastResize.current === key) {
        return;
      }

      if (resizeTimer.current) {
        window.clearTimeout(resizeTimer.current);
      }

      const paneId = selection.pane;
      resizeTimer.current = window.setTimeout(() => {
        resizeTimer.current = undefined;
        if (paneId) {
          sendTerminalResize(terminalStream.current, columns, rows);
          if (!isTerminalStreamOpen(terminalStream.current)) {
            void resizeActivePane(paneId, columns, rows, setOperation, setFitSize);
          }
        }
      }, 150);
    },
    [selection.pane, view],
  );

  const ensureTerminal = useCallback(
    async (columns = 120, rows = 34) => {
      if (!terminal.current) {
        const element = terminalElement.current;
        if (!element) {
          return undefined;
        }

        terminal.current = new WTerm(element, {
          autoResize: true,
          cols: columns || 120,
          cursorBlink: true,
          rows: rows || 34,
          onData: (data) => terminalDataHandler.current(data),
          onResize: scheduleResizeActivePane,
        });
        terminalReady.current = terminal.current.init();
      }

      await terminalReady.current;
      await waitForLayout();
      fitTerminalToContainer(terminal.current);
      setFitSize(`${terminal.current.cols}x${terminal.current.rows}`);
      scheduleResizeActivePane(terminal.current.cols, terminal.current.rows);
      return terminal.current;
    },
    [scheduleResizeActivePane],
  );

  const renderTerminal = useCallback(
    async (capture: CaptureResult) => {
      const term = await ensureTerminal(capture.terminal.columns, capture.terminal.rows);
      if (!term) {
        return;
      }

      resetTerminalSnapshot(term);
      term.write(capture.ansi.replaceAll("\n", "\r\n"));
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
      if (view !== "manage") {
        return;
      }

      if (!paneId) {
        renderTerminalText("No tmux pane selected. Create or attach to a session to begin.");
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

  const connectTerminalStream = useCallback(
    async (paneId = selection.pane) => {
      if (view !== "manage") {
        return;
      }

      terminalStream.current?.close();
      terminalStream.current = undefined;
      streamedPane.current = undefined;

      if (!paneId) {
        renderTerminalText("No tmux pane selected. Create or attach to a session to begin.");
        return;
      }

      const term = await ensureTerminal(selectedPane?.width, selectedPane?.height);
      if (!term) {
        return;
      }

      resetTerminalSnapshot(term);
      setTerminalStatus("loading");

      const socket = new WebSocket(streamUrl(`/api/panes/${encodeURIComponent(paneId)}/stream`));
      let receivedOutput = false;
      const fallbackTimer = window.setTimeout(() => {
        if (!receivedOutput && terminalStream.current === socket) {
          socket.close();
          terminalStream.current = undefined;
          streamedPane.current = undefined;
          void refreshActivePane(paneId);
        }
      }, 800);
      terminalStream.current = socket;
      streamedPane.current = paneId;

      socket.addEventListener("open", () => {
        setTerminalStatus("idle");
        sendTerminalResize(socket, term.cols, term.rows);
      });

      socket.addEventListener("message", (event) => {
        const payload = parseTerminalStreamMessage(event.data);
        if (!payload) {
          return;
        }

        if (payload.type === "output") {
          receivedOutput = true;
          window.clearTimeout(fallbackTimer);
          setTerminalStatus("idle");
          term.write(payload.data);
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
        if (terminalStream.current === socket) {
          terminalStream.current = undefined;
        }
      });
    },
    [
      ensureTerminal,
      refreshActivePane,
      renderTerminalText,
      selectedPane?.height,
      selectedPane?.width,
      selection.pane,
      view,
    ],
  );

  const refresh = useCallback(
    async (mode: "initial" | "manual" | "background" = "manual") => {
      setStatus(mode === "initial" ? "loading" : "refreshing");
      setOperation(mode === "manual" ? "refresh" : undefined);
      try {
        const nextSnapshot = await request<TmuxSnapshot>("/api/sessions");
        const nextSelection = applySnapshot(nextSnapshot);
        setStatus("idle");
        if (mode === "manual") {
          setNotice({ tone: "success", title: "Sessions refreshed" });
        }
        if (view === "manage") {
          await connectTerminalStream(nextSelection.pane);
        } else {
          setPreviewRun((run) => run + 1);
        }
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

  const sendKeys = useCallback(
    async (keys: string[]) => {
      if (!selection.pane) {
        setNotice({ tone: "warning", title: "No pane selected" });
        return;
      }

      setOperation("input");
      try {
        await request(`/api/panes/${encodeURIComponent(selection.pane)}/keys`, {
          method: "POST",
          body: { keys },
        });
        if (!isTerminalStreamOpen(terminalStream.current)) {
          await refreshActivePane(selection.pane);
        }
      } catch (error) {
        setNotice({ tone: "danger", title: "Unable to send key", body: message(error) });
      } finally {
        setOperation(undefined);
      }
    },
    [refreshActivePane, selection.pane],
  );

  const sendInput = useCallback(
    async (data: string) => {
      if (!selection.pane || data.length === 0) {
        return;
      }

      setOperation("input");
      try {
        await request(`/api/panes/${encodeURIComponent(selection.pane)}/input`, {
          method: "POST",
          body: { data },
        });
        if (!isTerminalStreamOpen(terminalStream.current)) {
          await refreshActivePane(selection.pane);
        }
      } catch (error) {
        setNotice({ tone: "danger", title: "Unable to send input", body: message(error) });
      } finally {
        setOperation(undefined);
      }
    },
    [refreshActivePane, selection.pane],
  );

  const sendTerminalData = useCallback(
    async (data: string) => {
      if (!selection.pane || data.length === 0) {
        return;
      }

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

  const openCreateSession = useCallback(() => {
    setView("overview");
    setShowCreateSession(true);
    setNewSessionName((current) => current || defaultSessionName());
  }, []);

  const createSession = useCallback(async () => {
    const name = newSessionName.trim();
    const cwd = newSessionCwd.trim();
    if (!name) {
      setNotice({ tone: "warning", title: "Session name is required" });
      return;
    }

    setOperation("create");
    try {
      const nextSnapshot = await request<TmuxSnapshot>("/api/sessions", {
        method: "POST",
        body: cwd ? { name, cwd } : { name },
      });
      const createdSession = nextSnapshot.sessions.find((session) => session.name === name);
      applySnapshot(nextSnapshot, { session: createdSession?.id });
      setNotice({ tone: "success", title: "Session created", body: name });
      setNewSessionName(defaultSessionName());
      setNewSessionCwd("");
      setShowCreateSession(false);
      setTerminalStatus("loading");
      setView("manage");
    } catch (error) {
      setNotice({ tone: "danger", title: "Unable to create session", body: message(error) });
    } finally {
      setOperation(undefined);
    }
  }, [applySnapshot, newSessionCwd, newSessionName]);

  const killActiveWindow = useCallback(async () => {
    if (!selection.window) {
      setNotice({ tone: "warning", title: "No window selected" });
      return;
    }
    if (!confirm(`Kill window ${selection.window}?`)) {
      return;
    }

    setOperation("kill");
    try {
      await request(`/api/windows/${encodeURIComponent(selection.window)}`, { method: "DELETE" });
      setNotice({ tone: "success", title: "Window killed", body: selection.window });
      await refresh("background");
    } catch (error) {
      setNotice({ tone: "danger", title: "Unable to kill window", body: message(error) });
    } finally {
      setOperation(undefined);
    }
  }, [refresh, selection.window]);

  const splitPane = useCallback(
    async (direction: "horizontal" | "vertical") => {
      if (!selection.pane) {
        setNotice({ tone: "warning", title: "No pane selected" });
        return;
      }

      setOperation("split");
      try {
        await request(`/api/panes/${encodeURIComponent(selection.pane)}/split`, {
          method: "POST",
          body: { direction },
        });
        setNotice({ tone: "success", title: "Pane split", body: direction });
        await refresh("background");
      } catch (error) {
        setNotice({ tone: "danger", title: "Unable to split pane", body: message(error) });
      } finally {
        setOperation(undefined);
      }
    },
    [refresh, selection.pane],
  );

  const configureApiToken = useCallback(() => {
    const current = localStorage.getItem(apiTokenStorageKey) ?? "";
    const next = prompt("API token", current);
    if (next === null) {
      return;
    }

    if (next.trim()) {
      localStorage.setItem(apiTokenStorageKey, next.trim());
      setNotice({ tone: "success", title: "API token saved" });
    } else {
      localStorage.removeItem(apiTokenStorageKey);
      setNotice({ tone: "neutral", title: "API token cleared" });
    }

    void refresh("background");
  }, [refresh]);

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

  useEffect(() => {
    void refresh("initial");
  }, []);

  useEffect(() => {
    if (view !== "manage") {
      terminalStream.current?.close();
      terminalStream.current = undefined;
      streamedPane.current = undefined;
      return;
    }

    if (selection.pane && streamedPane.current !== selection.pane) {
      void connectTerminalStream(selection.pane);
    }
  }, [connectTerminalStream, selection.pane, view]);

  useEffect(() => {
    const element = terminalElement.current;
    if (!element) {
      return;
    }

    const updateScrollState = () => {
      terminalUserScrolled.current = !isTerminalScrolledToBottom(element);
    };

    element.addEventListener("scroll", updateScrollState, { passive: true });
    element.addEventListener("wheel", updateScrollState, { passive: true });
    element.addEventListener("touchmove", updateScrollState, { passive: true });

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      element.removeEventListener("wheel", updateScrollState);
      element.removeEventListener("touchmove", updateScrollState);
    };
  }, []);

  useEffect(() => {
    const fitTerminal = () => {
      if (terminal.current && selection.pane && view === "manage") {
        fitTerminalToContainer(terminal.current);
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
    if (view !== "overview" || !snapshot) {
      return;
    }

    let cancelled = false;
    const run = previewRun;
    const nextPreviews: Record<string, PreviewState> = {};

    for (const session of snapshot.sessions) {
      nextPreviews[session.id] = { text: "Loading preview...", status: "loading" };
    }
    setSessionPreviews((current) => ({ ...current, ...nextPreviews }));

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
      if (cancelled || run !== previewRun) {
        return;
      }
      setSessionPreviews((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => {
      cancelled = true;
    };
  }, [previewRun, snapshot, view]);

  const health = useMemo(() => {
    if (status === "error") {
      return { tone: "danger" as const, label: "offline" };
    }
    if (status === "loading" || status === "refreshing") {
      return { tone: "warning" as const, label: "syncing" };
    }
    return { tone: "success" as const, label: "live" };
  }, [status]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="tmuapp">
          <span className="brand-mark" aria-hidden="true">
            tm
          </span>
          <div>
            <h1>tmuapp</h1>
            <p>tmux fleet control</p>
          </div>
        </div>
        <nav className="actions" aria-label="Global actions">
          <StatusChip tone={health.tone}>{health.label}</StatusChip>
          <Button
            className="icon-button"
            isDisabled={operation === "refresh"}
            type="button"
            onPress={() => void refresh("manual")}
            aria-label="Refresh sessions"
          >
            {operation === "refresh" ? <Spinner size="sm" /> : "R"}
          </Button>
          <Button className="ghost" type="button" onPress={configureApiToken}>
            Token
          </Button>
          <Button
            className="primary"
            isDisabled={operation === "create"}
            type="button"
            onPress={openCreateSession}
          >
            {operation === "create" ? "Creating..." : "New session"}
          </Button>
        </nav>
      </header>

      <main className="workspace">
        {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(undefined)} /> : null}

        <section
          className={view === "overview" ? "overview" : "overview hidden"}
          aria-label="Session overview"
        >
          <div className="overview-head">
            <div>
              <h2>Sessions</h2>
              <p>
                {sessions.length === 0
                  ? "Create a tmux session and open it in the browser."
                  : `${totalPanes} active panes across ${totalWindows} windows`}
              </p>
            </div>
            <Chip className="count-pill">{sessions.length}</Chip>
          </div>
          {showCreateSession || sessions.length === 0 ? (
            <SessionComposer
              cwd={newSessionCwd}
              isCreating={operation === "create"}
              name={newSessionName}
              onCancel={() => setShowCreateSession(false)}
              onCwdChange={setNewSessionCwd}
              onNameChange={setNewSessionName}
              onSubmit={() => void createSession()}
              showCancel={sessions.length > 0}
            />
          ) : null}
          <SessionGrid
            status={status}
            sessions={sessions}
            snapshot={snapshot}
            selectedSession={selection.session}
            previews={sessionPreviews}
            onRetry={() => void refresh("manual")}
            onCreate={openCreateSession}
            onOpen={openSession}
          />
        </section>

        <section
          className={view === "manage" ? "manager" : "manager hidden"}
          aria-label="Session manager"
        >
          <div className="manager-header">
            <Button className="ghost" type="button" onPress={showOverview}>
              Back to sessions
            </Button>
            <div>
              <strong>{selectedSession?.name ?? "No session selected"}</strong>
              <span>
                {selectedSession
                  ? `${selectedSession.windows} windows ${selectedSession.attached ? "attached" : "detached"}`
                  : "Select a session to inspect panes"}
              </span>
            </div>
          </div>

          <div className="manager-grid">
            <section className="main-pane">
              <WindowStrip
                windows={windows}
                selectedWindow={selection.window}
                onSelect={(windowId) => {
                  const pane = activeOrFirstPane(snapshot, windowId)?.id;
                  setSelection((current) => ({ ...current, window: windowId, pane }));
                  setTerminalStatus("loading");
                  void connectTerminalStream(pane);
                }}
              />

              <div className="terminal-shell">
                <div className="terminal-toolbar">
                  <div>
                    <strong>
                      {selectedPane?.title || selectedPane?.currentCommand || "No pane selected"}
                    </strong>
                    <span>
                      {selectedPane
                        ? `${selectedPane.id} ${selectedPane.width}x${selectedPane.height} ${selectedPane.currentPath}`
                        : "Create a pane or choose another window"}
                    </span>
                  </div>
                  <div className="terminal-actions">
                    <Button
                      className="ghost"
                      type="button"
                      onPress={() => void splitPane("horizontal")}
                    >
                      Split H
                    </Button>
                    <Button
                      className="ghost"
                      type="button"
                      onPress={() => void splitPane("vertical")}
                    >
                      Split V
                    </Button>
                    <Button className="danger" type="button" onPress={killActiveWindow}>
                      Kill window
                    </Button>
                  </div>
                </div>

                <div className="terminal-wrap">
                  {terminalStatus === "loading" ? (
                    <InlineLoading label="Preparing terminal" />
                  ) : null}
                  <div
                    ref={terminalElement}
                    id="terminal"
                    className="terminal"
                    aria-label="tmux pane terminal"
                  />
                </div>

                <form
                  className="input-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendInput(inputValue);
                    setInputValue("");
                  }}
                >
                  <Input
                    className="pane-input"
                    name="input"
                    autoComplete="off"
                    placeholder="Send literal input to selected pane"
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                  />
                  <Button
                    className="primary"
                    type="submit"
                    isDisabled={!selection.pane || inputValue.length === 0}
                  >
                    {operation === "input" ? "Sending..." : "Send"}
                  </Button>
                  <Button className="ghost" type="button" onPress={() => void sendKeys(["Enter"])}>
                    Enter
                  </Button>
                </form>
              </div>
            </section>

            <aside className="inspector" aria-label="Panes">
              <div className="panel-heading">
                <span>Panes</span>
                <small>{panes.length}</small>
              </div>
              <PaneList
                panes={panes}
                selectedPane={selection.pane}
                onSelect={(paneId) => {
                  setSelection((current) => ({ ...current, pane: paneId }));
                  setTerminalStatus("loading");
                  void connectTerminalStream(paneId);
                }}
              />
              <RendererMetrics fitSize={fitSize} />
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

function SessionGrid(props: {
  status: AsyncStatus;
  sessions: TmuxSession[];
  snapshot: TmuxSnapshot | undefined;
  selectedSession: string | undefined;
  previews: Record<string, PreviewState>;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (sessionId: string) => void;
}) {
  if (props.status === "loading") {
    return <InlineLoading label="Loading tmux sessions" />;
  }

  if (props.status === "error") {
    return (
      <EmptyState
        tone="neutral"
        title="tmux API is offline"
        body="Start the tmux API or retry when it is available."
        actionLabel="Retry"
        onAction={props.onRetry}
      />
    );
  }

  if (props.sessions.length === 0) {
    return (
      <EmptyState
        tone="neutral"
        title="No tmux sessions"
        body="Create a new session to start managing panes from the browser."
      />
    );
  }

  return (
    <div id="sessions" className="session-grid">
      {props.sessions.map((session) => {
        const windows = props.snapshot?.windows[session.id] ?? [];
        const panes = panesForSession(props.snapshot, session.id);
        const primaryPane = firstPaneForSession(props.snapshot, session.id);
        const preview = props.previews[session.id] ?? {
          text: "Loading preview...",
          status: "loading" as const,
        };
        const command = primaryPane?.currentCommand || primaryPane?.title || "idle";
        const path = primaryPane?.currentPath || "No working directory";

        return (
          <button
            key={session.id}
            className={`session-card ${session.id === props.selectedSession ? "selected" : ""}`}
            data-session-card={session.id}
            type="button"
            onClick={() => props.onOpen(session.id)}
          >
            <span className="session-card-top">
              <strong>{session.name}</strong>
              <StatusChip tone={session.attached ? "success" : "warning"}>
                {session.attached ? "attached" : "detached"}
              </StatusChip>
            </span>
            <span className="session-stats">
              <span>{windows.length} windows</span>
              <span>{panes.length} panes</span>
              <span>{command}</span>
            </span>
            <span className="session-path">{path}</span>
            <pre className={`session-preview ${preview.status}`}>{preview.text}</pre>
          </button>
        );
      })}
    </div>
  );
}

function SessionComposer(props: {
  cwd: string;
  isCreating: boolean;
  name: string;
  onCancel: () => void;
  onCwdChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  showCancel: boolean;
}) {
  return (
    <form
      className="session-composer"
      aria-label="Create session"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="composer-copy">
        <strong>New tmux session</strong>
        <span>Names may use letters, numbers, dot, underscore, plus, or dash.</span>
      </div>
      <Input
        className="composer-name"
        name="session-name"
        aria-label="Session name"
        autoComplete="off"
        placeholder="work"
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
      />
      <Input
        className="composer-cwd"
        name="session-cwd"
        aria-label="Working directory"
        autoComplete="off"
        placeholder="optional working directory"
        value={props.cwd}
        onChange={(event) => props.onCwdChange(event.target.value)}
      />
      <div className="composer-actions">
        {props.showCancel ? (
          <Button className="ghost" type="button" onPress={props.onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          className="primary"
          type="submit"
          isDisabled={props.isCreating || !props.name.trim()}
        >
          {props.isCreating ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}

function WindowStrip(props: {
  windows: TmuxWindow[];
  selectedWindow: string | undefined;
  onSelect: (windowId: string) => void;
}) {
  if (props.windows.length === 0) {
    return <div className="window-strip empty-line">No windows in selected session</div>;
  }

  return (
    <div className="window-strip" role="tablist" aria-label="Windows">
      {props.windows.map((window) => (
        <Button
          key={window.id}
          className={`window-tab ${window.id === props.selectedWindow ? "selected" : ""}`}
          aria-selected={window.id === props.selectedWindow}
          type="button"
          onPress={() => props.onSelect(window.id)}
        >
          <span>
            {window.index}:{window.name}
          </span>
          <small>{window.panes}</small>
        </Button>
      ))}
    </div>
  );
}

function PaneList(props: {
  panes: TmuxPane[];
  selectedPane: string | undefined;
  onSelect: (paneId: string) => void;
}) {
  if (props.panes.length === 0) {
    return (
      <div className="pane-list">
        <div className="empty-line">No panes in this window</div>
      </div>
    );
  }

  return (
    <div className="pane-list">
      {props.panes.map((pane) => (
        <Button
          key={pane.id}
          className={`pane-item ${pane.id === props.selectedPane ? "selected" : ""}`}
          type="button"
          onPress={() => props.onSelect(pane.id)}
        >
          <span>{pane.title || pane.currentCommand || pane.id}</span>
          <small>
            {pane.width}x{pane.height} {pane.currentPath}
          </small>
        </Button>
      ))}
    </div>
  );
}

function RendererMetrics({ fitSize }: { fitSize: string }) {
  return (
    <section className="metrics">
      <h2>Renderer</h2>
      <dl>
        <div>
          <dt>Mode</dt>
          <dd>wterm ANSI</dd>
        </div>
        <div>
          <dt>Fit</dt>
          <dd id="fit-size">{fitSize}</dd>
        </div>
        <div>
          <dt>API</dt>
          <dd>{apiLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="inline-loading" role="status">
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState(props: {
  tone: "neutral" | "danger";
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className={`empty-state ${props.tone}`}>
      <strong>{props.title}</strong>
      <p>{props.body}</p>
      {props.actionLabel && props.onAction ? (
        <Button className="primary" type="button" onPress={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <Alert
      className={`notice ${notice.tone}`}
      status={notice.tone === "danger" ? "danger" : "success"}
    >
      <Alert.Content>
        <Alert.Title>{notice.title}</Alert.Title>
        {notice.body ? <Alert.Description>{notice.body}</Alert.Description> : null}
      </Alert.Content>
      <Button
        className="ghost notice-close"
        type="button"
        onPress={onDismiss}
        aria-label="Dismiss notification"
      >
        Close
      </Button>
    </Alert>
  );
}

function StatusChip({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return <Chip className={`status ${tone}`}>{children}</Chip>;
}

function reconcileSelection(snapshot: TmuxSnapshot | undefined, current: Selection): Selection {
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

function currentSession(snapshot: TmuxSnapshot | undefined, sessionId: string | undefined) {
  return snapshot?.sessions.find((session) => session.id === sessionId);
}

function currentWindows(
  snapshot: TmuxSnapshot | undefined,
  sessionId: string | undefined,
): TmuxWindow[] {
  return sessionId && snapshot ? (snapshot.windows[sessionId] ?? []) : [];
}

function currentPanes(
  snapshot: TmuxSnapshot | undefined,
  windowId: string | undefined,
): TmuxPane[] {
  return windowId && snapshot ? (snapshot.panes[windowId] ?? []) : [];
}

function panesForSession(snapshot: TmuxSnapshot | undefined, sessionId: string): TmuxPane[] {
  const windows = snapshot?.windows[sessionId] ?? [];
  return windows.flatMap((window) => snapshot?.panes[window.id] ?? []);
}

function activeOrFirstWindow(
  snapshot: TmuxSnapshot | undefined,
  sessionId: string | undefined,
): TmuxWindow | undefined {
  const windows = sessionId && snapshot ? (snapshot.windows[sessionId] ?? []) : [];
  return windows.find((window) => window.active) ?? windows[0];
}

function activeOrFirstPane(
  snapshot: TmuxSnapshot | undefined,
  windowId: string | undefined,
): TmuxPane | undefined {
  const panes = windowId && snapshot ? (snapshot.panes[windowId] ?? []) : [];
  return panes.find((pane) => pane.active) ?? panes[0];
}

function firstPaneForSession(
  snapshot: TmuxSnapshot | undefined,
  sessionId: string,
): TmuxPane | undefined {
  const window = activeOrFirstWindow(snapshot, sessionId);
  return activeOrFirstPane(snapshot, window?.id);
}

function chooseExisting(current: string | undefined, candidates: string[]) {
  return current && candidates.includes(current) ? current : undefined;
}

function previewText(ansi: string) {
  const text = stripAnsi(ansi)
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-5)
    .join("\n");

  return text || "No output";
}

const ansiPattern = new RegExp(
  String.raw`[\x1b\x9b][[\]\()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))`,
  "g",
);

function stripAnsi(value: string) {
  return value.replace(ansiPattern, "");
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: init.method ?? "GET",
    headers: requestHeaders(init.body !== undefined),
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || response.statusText);
  }

  return (await response.json()) as T;
}

function streamUrl(path: string) {
  const base = apiBase ? new URL(apiBase, window.location.href) : new URL(window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path;
  base.search = "";
  const token = apiToken();
  if (token) {
    base.searchParams.set("token", token);
  }
  return base.toString();
}

function apiToken() {
  return configuredToken?.trim() || localStorage.getItem(apiTokenStorageKey)?.trim() || "";
}

function parseTerminalStreamMessage(value: unknown): TerminalStreamMessage | undefined {
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

function isTerminalStreamOpen(socket: WebSocket | undefined): socket is WebSocket {
  return socket?.readyState === WebSocket.OPEN;
}

function sendTerminalResize(socket: WebSocket | undefined, columns: number, rows: number) {
  sendTerminalCommand(socket, { type: "resize", columns, rows });
}

function sendTerminalCommand(socket: WebSocket | undefined, command: TerminalStreamCommand) {
  if (isTerminalStreamOpen(socket)) {
    socket.send(JSON.stringify(command));
  }
}

function requestHeaders(hasBody: boolean) {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const token = apiToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return Object.keys(headers).length ? headers : undefined;
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

function resetTerminalSnapshot(term: WTerm) {
  term.bridge?.init(term.cols, term.rows);
}

function waitForLayout() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function fitTerminalToContainer(term: WTerm) {
  const fit = measureTerminalFit(term.element);
  if (!fit) {
    return;
  }

  if (fit.columns !== term.cols || fit.rows !== term.rows) {
    term.resize(fit.columns, fit.rows);
  }
}

function measureTerminalFit(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const contentWidth =
    element.clientWidth -
    (Number.parseFloat(styles.paddingLeft) || 0) -
    (Number.parseFloat(styles.paddingRight) || 0);
  const contentHeight =
    element.clientHeight -
    (Number.parseFloat(styles.paddingTop) || 0) -
    (Number.parseFloat(styles.paddingBottom) || 0);

  const probeRow = document.createElement("div");
  probeRow.className = "term-row";
  probeRow.style.position = "absolute";
  probeRow.style.visibility = "hidden";
  const probeCell = document.createElement("span");
  probeCell.textContent = "W";
  probeRow.appendChild(probeCell);
  element.appendChild(probeRow);
  const cellWidth = probeCell.getBoundingClientRect().width;
  const rowHeight = probeRow.getBoundingClientRect().height;
  probeRow.remove();

  if (contentWidth <= 0 || contentHeight <= 0 || cellWidth <= 0 || rowHeight <= 0) {
    return undefined;
  }

  return {
    columns: clamp(Math.floor(contentWidth / cellWidth), 20, 500),
    rows: clamp(Math.floor(contentHeight / rowHeight), 5, 200),
  };
}

function isTerminalScrolledToBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 5;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function defaultSessionName() {
  return `work-${Math.floor(Date.now() / 1000)}`;
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(<App />);
