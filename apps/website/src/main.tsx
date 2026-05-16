import "@xterm/xterm/css/xterm.css";
import { createTerminal, type TermAdapter } from "./terminal/terminal-adapter";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Input } from "@heroui/react/input";
import { Spinner } from "@heroui/react/spinner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TmuxSnapshot, TmuxWindow } from "utils";
import "./style.css";
import { apiLabel, apiTokenStorageKey, request, streamUrl } from "./api/client";
import { ConfirmWindowKill } from "./components/ConfirmWindowKill";
import { InlineLoading } from "./components/InlineLoading";
import { NoticeBanner } from "./components/NoticeBanner";
import { SessionComposer } from "./components/SessionComposer";
import { SessionGrid } from "./components/SessionGrid";
import { StatusChip } from "./components/StatusChip";
import { TokenPanel } from "./components/TokenPanel";
import { WindowStrip } from "./components/WindowStrip";
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
import {
  activeOrFirstPane,
  currentPanes,
  currentSession,
  currentWindows,
  defaultSessionName,
  firstPaneForSession,
  message,
  panesForSession,
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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fontSize, setFontSizeState] = useState(() => {
    const stored = localStorage.getItem("tmuapp.fontSize");
    return stored ? Number(stored) : 14;
  });
  const paneActivity = useRef<Record<string, number>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
      // xterm.js scrolls via its .xterm-viewport element, not the container.
      // Attach the scroll listener after init (when the viewport exists).
      {
        const viewport = terminal.current?.element.querySelector<HTMLElement>(".xterm-viewport");
        if (viewport && !viewport.hasAttribute("data-scroll-listener")) {
          viewport.setAttribute("data-scroll-listener", "1");
          viewport.addEventListener("scroll", () => {
            // Hand off to the scroll helpers which also resolve the viewport.
            if (isScrolledNearTop(viewport)) {
              terminalShouldFollow.current = false;
              return;
            }
            if (isScrolledToBottom(viewport)) {
              terminalShouldFollow.current = true;
            }
          });
        }
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
          // Record activity timestamp for the current pane so the
          // window strip can show an activity indicator on tabs.
          paneActivity.current[paneId] = Date.now();
          // normalizeAnsi adds \r before bare \n so that cursor resets to
          // column 0 on each new line. The tmux control-mode stream may
          // deliver bare \n (LF) which xterm.js treats as line-feed-only
          // (cursor moves down without returning to column 0), causing
          // staircase / overlapping text with TUI applications.
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
      // When streaming live, the terminal onData handler (sendTerminalData) already
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
      // Dispose the xterm instance and clear refs so that when the user
      // returns to the manage view a fresh terminal is created on the new
      // DOM element. Without this, ensureTerminal skips creation because
      // terminal.current is still set (to the now-unmounted instance).
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

  // Keyboard shortcuts for window/pane switching when the terminal is focused.
  useEffect(() => {
    if (view !== "manage") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only activate when the terminal area has focus, not when the
      // input row or any form control is focused.
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Alt+1..9: switch to window by index
        if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          const idx = Number.parseInt(e.key) - 1;
          const win = windows[idx];
          if (win) {
            const pane = activeOrFirstPane(snapshot, win.id)?.id;
            setSelection((prev) => ({ ...prev, window: win.id, pane }));
            setTerminalStatus("loading");
            void connectTerminalStream(pane);
          }
          return;
        }

        // Alt+ArrowLeft/Right: previous/next window
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const currentIdx = windows.findIndex((w) => w.id === selection.window);
          if (currentIdx === -1 || windows.length <= 1) return;
          const nextIdx =
            e.key === "ArrowRight"
              ? (currentIdx + 1) % windows.length
              : (currentIdx - 1 + windows.length) % windows.length;
          const win = windows[nextIdx];
          if (win) {
            const pane = activeOrFirstPane(snapshot, win.id)?.id;
            setSelection((prev) => ({ ...prev, window: win.id, pane }));
            setTerminalStatus("loading");
            void connectTerminalStream(pane);
          }
        }
        return;
      }

      // Ctrl+Alt+ArrowLeft/Right: previous/next pane in the current window
      if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const currentIdx = panes.findIndex((p) => p.id === selection.pane);
          if (currentIdx === -1 || panes.length <= 1) return;
          const nextIdx =
            e.key === "ArrowRight"
              ? (currentIdx + 1) % panes.length
              : (currentIdx - 1 + panes.length) % panes.length;
          const pane = panes[nextIdx];
          if (pane) {
            setSelection((prev) => ({ ...prev, pane: pane.id }));
            setTerminalStatus("loading");
            void connectTerminalStream(pane.id);
          }
        }
      }

      // Ctrl+L: focus the pane input line (standard terminal clear-screen
      // shortcut repurposed as focus command when the terminal is active).
      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key === "l") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[name="pane-input"]');
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      // Cmd+F or Ctrl+Shift+F: toggle terminal search
      if (
        (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "f") ||
        (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key === "F")
      ) {
        e.preventDefault();
        setShowSearch((prev) => !prev);
        return;
      }

      // Font size controls: Cmd+=/Cmd+-/Cmd+0 (macOS) or Ctrl+=/Ctrl+-/Ctrl+0
      const isFontSizeMod = e.metaKey || e.ctrlKey;
      if (isFontSizeMod && !e.altKey && !e.shiftKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          setFontSizeState((prev) => {
            const next = Math.min(prev + 1, 24);
            localStorage.setItem("tmuapp.fontSize", String(next));
            if (terminal.current) {
              terminal.current.setFontSize(next);
              terminalCellMetrics.current = undefined;
              fitTerminalToContainer(terminal.current, terminalCellMetrics);
            }
            return next;
          });
          return;
        }
        if (e.key === "-") {
          e.preventDefault();
          setFontSizeState((prev) => {
            const next = Math.max(prev - 1, 10);
            localStorage.setItem("tmuapp.fontSize", String(next));
            if (terminal.current) {
              terminal.current.setFontSize(next);
              terminalCellMetrics.current = undefined;
              fitTerminalToContainer(terminal.current, terminalCellMetrics);
            }
            return next;
          });
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          const next = 14;
          localStorage.setItem("tmuapp.fontSize", String(next));
          setFontSizeState(next);
          if (terminal.current) {
            terminal.current.setFontSize(next);
            terminalCellMetrics.current = undefined;
            fitTerminalToContainer(terminal.current, terminalCellMetrics);
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, windows, panes, selection, snapshot, connectTerminalStream]);

  // Auto-focus the search input when the search bar opens.
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [showSearch]);

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
            {operation === "refresh" ? (
              <Spinner size="sm" aria-label="Refreshing sessions" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M13.65 2.35A7.96 7.96 0 008 0a8 8 0 100 16 7.96 7.96 0 005.657-2.343 1 1 0 10-1.414-1.414A6 6 0 118 2a5.99 5.99 0 014.243 1.757L10.5 5.5H16V0l-2.35 2.35z"
                  fill="currentColor"
                />
              </svg>
            )}
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
                snapshot={snapshot}
                paneActivity={paneActivity.current}
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
                      {terminalStatus === "loading" || terminalStatus === "refreshing" ? (
                        <span className="terminal-status-dot" aria-hidden="true" />
                      ) : null}
                      {selectedPane?.title || selectedPane?.currentCommand || "No pane selected"}
                    </h2>
                    <span>
                      {selectedPane
                        ? `${selectedPane.width}x${selectedPane.height} ${selectedPane.currentPath}`
                        : "Create a pane or choose another window"}
                    </span>
                  </div>
                  <div className="terminal-toolbar-center">
                    <span className="font-size-control">
                      <Button
                        className="font-size-btn"
                        type="button"
                        aria-label="Decrease font size"
                        isDisabled={fontSize <= 10}
                        onPress={() => {
                          const next = Math.max(fontSize - 1, 10);
                          localStorage.setItem("tmuapp.fontSize", String(next));
                          setFontSizeState(next);
                          if (terminal.current) {
                            terminal.current.setFontSize(next);
                            terminalCellMetrics.current = undefined;
                            fitTerminalToContainer(terminal.current, terminalCellMetrics);
                          }
                        }}
                      >
                        −
                      </Button>
                      <span className="font-size-value">{fontSize}px</span>
                      <Button
                        className="font-size-btn"
                        type="button"
                        aria-label="Increase font size"
                        isDisabled={fontSize >= 24}
                        onPress={() => {
                          const next = Math.min(fontSize + 1, 24);
                          localStorage.setItem("tmuapp.fontSize", String(next));
                          setFontSizeState(next);
                          if (terminal.current) {
                            terminal.current.setFontSize(next);
                            terminalCellMetrics.current = undefined;
                            fitTerminalToContainer(terminal.current, terminalCellMetrics);
                          }
                        }}
                      >
                        +
                      </Button>
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

                {showSearch ? (
                  <form
                    className="terminal-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const addon = terminal.current?.searchAddon;
                      if (addon && searchQuery) {
                        addon.findNext(searchQuery);
                      }
                    }}
                  >
                    <input
                      ref={searchInputRef}
                      className="terminal-search-input"
                      type="text"
                      placeholder="Find…"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        const addon = terminal.current?.searchAddon;
                        if (addon && e.target.value) {
                          addon.findNext(e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setShowSearch(false);
                          setSearchQuery("");
                          terminal.current?.focus();
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (e.shiftKey) {
                            terminal.current?.searchAddon?.findPrevious(searchQuery);
                          } else {
                            terminal.current?.searchAddon?.findNext(searchQuery);
                          }
                        }
                      }}
                    />
                    <Button
                      className="ghost search-btn"
                      type="button"
                      aria-label="Previous match"
                      onPress={() => terminal.current?.searchAddon?.findPrevious(searchQuery)}
                    >
                      ↑
                    </Button>
                    <Button
                      className="ghost search-btn"
                      type="button"
                      aria-label="Next match"
                      onPress={() => terminal.current?.searchAddon?.findNext(searchQuery)}
                    >
                      ↓
                    </Button>
                    <Button
                      className="ghost search-btn"
                      type="button"
                      aria-label="Close search"
                      onPress={() => {
                        setShowSearch(false);
                        setSearchQuery("");
                        terminal.current?.focus();
                      }}
                    >
                      ✕
                    </Button>
                  </form>
                ) : null}

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
                      if (
                        event.key === "Tab" &&
                        !event.shiftKey &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.altKey
                      ) {
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
                  {panes.length > 1 ? (
                    <Chip className="pane-count-pill">{panes.length}</Chip>
                  ) : null}
                </form>
              </div>

              {panes.length > 1 ? (
                <div className="pane-strip" role="tablist" aria-label="Panes">
                  {panes.map((pane) => (
                    <Button
                      key={pane.id}
                      className={`pane-tab ${pane.id === selection.pane ? "selected" : ""}`}
                      aria-selected={pane.id === selection.pane}
                      aria-controls="terminal-panel"
                      type="button"
                      onPress={() => {
                        setSelection((current) => ({ ...current, pane: pane.id }));
                        setTerminalStatus("loading");
                        void connectTerminalStream(pane.id);
                      }}
                    >
                      {pane.index}:{pane.title || pane.currentCommand || pane.id}
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

function resetTerminalSnapshot(term: TermAdapter) {
  term.reset();
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(<App />);
