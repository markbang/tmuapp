import "@wterm/dom/css";
import { WTerm } from "@wterm/dom";
import { Alert } from "@heroui/react/alert";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Input } from "@heroui/react/input";
import { Spinner } from "@heroui/react/spinner";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type TmuxPane, type TmuxSession, type TmuxSnapshot, type TmuxWindow } from "utils";
import "./style.css";
import { apiLabel, apiTokenStorageKey, request, streamUrl } from "./api/client";
import {
  fitTerminalToContainer,
  type TerminalCellMetrics,
  waitForLayout,
} from "./terminal/terminal-fit";
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
  const [showTokenSettings, setShowTokenSettings] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(
    () => localStorage.getItem(apiTokenStorageKey) ?? "",
  );
  const [pendingKillWindow, setPendingKillWindow] = useState<TmuxWindow>();
  const [previewRun, setPreviewRun] = useState(0);
  const [sessionPreviews, setSessionPreviews] = useState<Record<string, PreviewState>>({});
  const [, setFitSize] = useState("pending");

  const terminalElement = useRef<HTMLDivElement | null>(null);
  const terminal = useRef<WTerm | undefined>(undefined);
  const terminalReady = useRef<Promise<WTerm> | undefined>(undefined);
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

  const scheduleResizeActivePane = useCallback((columns: number, rows: number) => {
    resizeScheduler.current(columns, rows);
  }, []);

  const ensureTerminal = useCallback(
    async (columns = 120, rows = 34) => {
      if (!terminal.current) {
        const element = terminalElement.current;
        if (!element) {
          return undefined;
        }

        terminal.current = new WTerm(element, {
          autoResize: false,
          cols: columns || 120,
          cursorBlink: true,
          rows: rows || 34,
          onData: (data) => terminalDataHandler.current(data),
          onResize: scheduleResizeActivePane,
        });
        terminalReady.current = terminal.current.init();
        element.addEventListener("scroll", () => {
          if (isScrolledNearTop(element)) {
            terminalShouldFollow.current = false;
            return;
          }
          if (isScrolledToBottom(element)) {
            terminalShouldFollow.current = true;
          }
        });
      }

      await terminalReady.current;
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
      if (!term) {
        return;
      }

      const shouldFollow = terminalShouldFollow.current;
      resetTerminalSnapshot(term);
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

  resizeScheduler.current = (columns: number, rows: number) => {
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
          // Resize already succeeded; capture still gives the terminal the correct grid.
        }
        if (terminalShouldFollow.current) {
          await refreshActivePane(paneId);
        }
      })();
    }, 150);
  };

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

      // Resize the tmux pane to match the terminal viewport BEFORE connecting
      // the stream. This ensures the initial capture (sent via WebSocket by
      // sendInitialCapture) is formatted for the correct dimensions, so the
      // content renders without misalignment.
      await resizeActivePane(paneId, term.cols, term.rows, setOperation, setFitSize);

      const socket = new WebSocket(streamUrl(`/api/panes/${encodeURIComponent(paneId)}/stream`));
      let receivedOutput = false;
      const fallbackTimer = window.setTimeout(() => {
        if (!receivedOutput && terminalStream.current === socket) {
          socket.close();
          terminalStream.current = undefined;
          streamedPane.current = undefined;
          // Stream didn't deliver content — fall back to HTTP capture.
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
        if (!payload) {
          return;
        }

        if (payload.type === "output") {
          receivedOutput = true;
          window.clearTimeout(fallbackTimer);
          setTerminalStatus("idle");
          const shouldFollow = terminalShouldFollow.current;
          term.write(payload.data);
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
        if (terminalStream.current === socket) {
          terminalStream.current = undefined;
        }
      });
    },
    [
      ensureTerminal,
      refreshActivePane,
      renderTerminalText,
      resizeActivePane,
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

      followTerminalOutput(terminalElement.current, terminalShouldFollow);
      // Named keys like "Enter" must go through the HTTP /keys endpoint which maps
      // them to actual terminal key sequences. The WebSocket stream only accepts
      // raw character data, so named keys can't be sent through it directly.
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

      followTerminalOutput(terminalElement.current, terminalShouldFollow);
      // The form-based input path: send text data + an Enter key via HTTP.
      // When streaming live, the WTerm onData handler (sendTerminalData) already
      // sends raw keystrokes through WebSocket — we don't need to duplicate that here.
      // Using HTTP ensures the input + Enter is properly sequenced.
      setOperation("input");
      try {
        await request(`/api/panes/${encodeURIComponent(selection.pane)}/input`, {
          method: "POST",
          body: { data },
        });
        // Also send Enter after the input text so the shell executes it.
        await request(`/api/panes/${encodeURIComponent(selection.pane)}/keys`, {
          method: "POST",
          body: { keys: ["Enter"] },
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

  const sendInputKey = useCallback(
    async (key: string, draft = inputValue) => {
      const value = draft;
      if (value.length > 0) {
        await sendInput(value);
        setInputValue("");
      }
      await sendKeys([key]);
    },
    [inputValue, sendInput, sendKeys],
  );

  const sendTerminalData = useCallback(
    async (data: string) => {
      if (!selection.pane || data.length === 0) {
        return;
      }

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
    const windowToKill = currentWindows(snapshot, selection.session).find(
      (window) => window.id === selection.window,
    );

    if (!windowToKill) {
      setNotice({ tone: "warning", title: "No window selected" });
      return;
    }

    setPendingKillWindow(windowToKill);
  }, [selection.session, selection.window, snapshot]);

  const confirmKillWindow = useCallback(async () => {
    if (!pendingKillWindow) {
      return;
    }

    setOperation("kill");
    try {
      await request(`/api/windows/${encodeURIComponent(pendingKillWindow.id)}`, {
        method: "DELETE",
      });
      setNotice({ tone: "success", title: "Window killed", body: pendingKillWindow.name });
      setPendingKillWindow(undefined);
      await refresh("background");
    } catch (error) {
      setNotice({ tone: "danger", title: "Unable to kill window", body: message(error) });
    } finally {
      setOperation(undefined);
    }
  }, [pendingKillWindow, refresh]);

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
    if (view !== "overview" || !snapshot) {
      return;
    }

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
      <a className="skip-link" href="#main-content">
        Skip to Content
      </a>
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
        {view === "manage" && selectedSession ? (
          <div className="session-context">
            <Button className="ghost" type="button" onPress={showOverview}>
              Back
            </Button>
            <strong>{selectedSession.name}</strong>
            <span>
              {selectedSession.windows} windows ·{" "}
              {panesForSession(snapshot, selectedSession.id).length} panes
            </span>
            <StatusChip tone={selectedSession.attached ? "success" : "warning"}>
              {selectedSession.attached ? "attached" : "detached"}
            </StatusChip>
          </div>
        ) : null}
        <nav className="actions" aria-label="Global actions">
          <StatusChip tone={health.tone}>{health.label}</StatusChip>
          <Button
            className="icon-button"
            isDisabled={operation === "refresh"}
            type="button"
            onPress={() => void refresh("manual")}
            aria-label="Refresh sessions"
          >
            {operation === "refresh" ? <Spinner size="sm" aria-label="Refreshing sessions" /> : "R"}
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
            {operation === "create" ? "Creating…" : "New Session"}
          </Button>
        </nav>
      </header>

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
        {pendingKillWindow ? (
          <ConfirmWindowKill
            isDeleting={operation === "kill"}
            window={pendingKillWindow}
            onCancel={() => setPendingKillWindow(undefined)}
            onConfirm={() => void confirmKillWindow()}
          />
        ) : null}

        {view === "overview" ? (
          <section className="overview" aria-label="Session overview">
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
        ) : null}

        {view === "manage" ? (
          <section className="manager" aria-label="Session manager">
            <div className="manager-body">
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
                    <h2 className="terminal-heading">
                      {selectedPane?.title || selectedPane?.currentCommand || "No pane selected"}
                    </h2>
                    <span>
                      {selectedPane
                        ? `${selectedPane.width}x${selectedPane.height} ${selectedPane.currentPath}`
                        : "Create a pane or choose another window"}
                    </span>
                  </div>
                  <div className="terminal-actions">
                    <Button
                      className="ghost"
                      type="button"
                      onPress={() => void splitPane("horizontal")}
                      isDisabled={!selection.pane || operation === "split"}
                    >
                      Split H
                    </Button>
                    <Button
                      className="ghost"
                      type="button"
                      onPress={() => void splitPane("vertical")}
                      isDisabled={!selection.pane || operation === "split"}
                    >
                      Split V
                    </Button>
                    <Button
                      className="danger"
                      type="button"
                      onPress={killActiveWindow}
                      isDisabled={!selection.window || operation === "kill"}
                    >
                      Kill Window
                    </Button>
                  </div>
                </div>

                <div className="terminal-wrap">
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

                <form
                  className="input-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    followTerminalOutput(terminalElement.current, terminalShouldFollow);
                    void sendInput(inputValue);
                    setInputValue("");
                  }}
                >
                  <span className="input-label">Send command to active pane</span>
                  <Input
                    className="pane-input"
                    name="pane-input"
                    aria-label="Pane input"
                    autoComplete="off"
                    placeholder={'printf "hello"…'}
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Tab") {
                        event.preventDefault();
                        void sendInputKey("Tab", inputValue);
                      }
                    }}
                  />
                  <Button
                    className="primary"
                    type="submit"
                    isDisabled={!selection.pane || inputValue.length === 0}
                  >
                    {operation === "input" ? "Sending…" : "Run"}
                  </Button>
                  <Button className="ghost" type="button" onPress={() => void sendKeys(["Enter"])}>
                    Enter
                  </Button>
                  {panes.length > 1 ? (
                    <Chip className="pane-count-pill">{panes.length}</Chip>
                  ) : null}
                </form>
              </div>

              {panes.length > 1 ? (
                <div className="pane-strip" aria-label="Panes">
                  {panes.map((pane) => (
                    <Button
                      key={pane.id}
                      className={`pane-tab ${pane.id === selection.pane ? "selected" : ""}`}
                      type="button"
                      onPress={() => {
                        setSelection((current) => ({ ...current, pane: pane.id }));
                        setTerminalStatus("loading");
                        void connectTerminalStream(pane.id);
                      }}
                    >
                      {pane.title || pane.currentCommand || pane.id}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
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
    return <InlineLoading label="Loading tmux sessions…" />;
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
          text: "Loading preview…",
          status: "loading" as const,
        };
        const command = primaryPane?.currentCommand || primaryPane?.title || "idle";
        const path = primaryPane?.currentPath || "No working directory";

        return (
          <Button
            key={session.id}
            className={`session-card ${session.id === props.selectedSession ? "selected" : ""}`}
            data-session-card={session.id}
            type="button"
            aria-label={`Open session ${session.name} with ${windows.length} windows and ${panes.length} panes`}
            onPress={() => props.onOpen(session.id)}
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
          </Button>
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
        placeholder="work…"
        spellCheck={false}
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
      />
      <Input
        className="composer-cwd"
        name="session-cwd"
        aria-label="Working directory"
        autoComplete="off"
        placeholder="/repo…"
        spellCheck={false}
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
          {props.isCreating ? "Creating…" : "Create"}
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
          id={windowTabId(window.id)}
          className={`window-tab ${window.id === props.selectedWindow ? "selected" : ""}`}
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

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="inline-loading" role="status" aria-live="polite">
      <Spinner size="sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function TokenPanel(props: {
  token: string;
  onCancel: () => void;
  onSave: () => void;
  onTokenChange: (value: string) => void;
}) {
  const dialogRef = useFocusTrap<HTMLFormElement>();

  return (
    <div
      className="floating-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-title"
      onClick={props.onCancel}
      onKeyDown={(event) => handleDialogKeyDown(event, props.onCancel)}
    >
      <form
        ref={dialogRef}
        className="panel-card settings-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave();
        }}
      >
        <div>
          <h2 id="token-title">API Token</h2>
          <p>Requests use this token until it is cleared.</p>
        </div>
        <Input
          name="api-token"
          aria-label="Bearer token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="tmux-token…"
          value={props.token}
          onChange={(event) => props.onTokenChange(event.target.value)}
        />
        <div className="panel-actions">
          <Button className="ghost" type="button" onPress={props.onCancel}>
            Cancel
          </Button>
          <Button className="primary" type="submit">
            Save Token
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConfirmWindowKill(props: {
  isDeleting: boolean;
  window: TmuxWindow;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>();

  return (
    <div
      className="floating-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kill-title"
      onClick={props.onCancel}
      onKeyDown={(event) => handleDialogKeyDown(event, props.onCancel)}
    >
      <div
        ref={dialogRef}
        className="panel-card confirm-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id="kill-title">Kill Window</h2>
          <p>
            Window {props.window.index}:{props.window.name} and its panes will close immediately.
          </p>
        </div>
        <div className="panel-actions">
          <Button className="ghost" type="button" onPress={props.onCancel}>
            Cancel
          </Button>
          <Button
            className="danger"
            type="button"
            onPress={props.onConfirm}
            isDisabled={props.isDeleting}
          >
            {props.isDeleting ? "Killing…" : "Kill Window"}
          </Button>
        </div>
      </div>
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
      role="alert"
      aria-live="assertive"
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

function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const panel = ref.current;
    if (!panel) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = getFocusableElements(panel);
    (focusable[0] ?? panel).focus();

    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    const panel = ref.current;
    if (!panel) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, []);

  return ref;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
}

function handleDialogKeyDown(event: React.KeyboardEvent, onCancel: () => void) {
  if (event.key === "Escape") {
    event.stopPropagation();
    onCancel();
  }
}

function windowTabId(windowId: string) {
  return `window-tab-${windowId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function defaultSessionName() {
  return `work-${Math.floor(Date.now() / 1000)}`;
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(<App />);
