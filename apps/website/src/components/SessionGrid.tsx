import { Button } from "@heroui/react/button";
import { useEffect, useState } from "react";
import type { TmuxSession, TmuxSnapshot } from "utils";
import type { AsyncStatus, PreviewState } from "../types";
import { firstPaneForSession } from "../tmux-helpers";
import { InlineLoading } from "./InlineLoading";

export function SessionGrid(props: {
  status: AsyncStatus;
  sessions: TmuxSession[];
  snapshot: TmuxSnapshot | undefined;
  selectedSession: string | undefined;
  previews: Record<string, PreviewState>;
  isCreating: boolean;
  onConfigureToken: () => void;
  onRetry: () => void;
  onCreate: () => void;
  onDelete: (sessionId: string) => void;
  onOpen: (sessionId: string) => void;
}) {
  const [time, setTime] = useState(() => currentTime());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTime(currentTime());
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedSessionName =
    props.sessions.find((session) => session.id === props.selectedSession)?.name ?? "None";

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-heading">
          <div className="dashboard-brand">
            <span className="online-dot" aria-hidden="true" />
            <span>Tmux Web Panel</span>
          </div>
          <div className="dashboard-divider" />
          <div className="dashboard-kicker">Overview</div>
        </div>
        <div className="dashboard-actions">
          <span className="dashboard-summary">
            {props.sessions.length} session{props.sessions.length === 1 ? "" : "s"}
          </span>
          <Button className="dashboard-token-button" type="button" onPress={props.onConfigureToken}>
            Token
          </Button>
          <Button
            className="dashboard-new-button"
            type="button"
            isDisabled={props.isCreating}
            onPress={props.onCreate}
          >
            <span aria-hidden="true">+</span>
            {props.isCreating ? "Creating…" : "New Window"}
          </Button>
        </div>
      </header>

      <main className="dashboard-main">
        {props.status === "loading" ? <InlineLoading label="Loading tmux sessions…" /> : null}

        {props.status === "error" ? (
          <div className="dashboard-empty">
            <div className="empty-icon" aria-hidden="true">
              ⌘
            </div>
            <h2>tmux API is offline</h2>
            <p>Start the tmux API or retry when it is available.</p>
            <Button className="empty-create-button" type="button" onPress={props.onRetry}>
              Retry
            </Button>
          </div>
        ) : null}

        {props.status !== "loading" && props.status !== "error" && props.sessions.length === 0 ? (
          <div className="dashboard-empty">
            <div className="empty-icon" aria-hidden="true">
              ⌘
            </div>
            <h2>No active windows</h2>
            <p>Create a new window to get started.</p>
            <Button className="empty-create-button" type="button" onPress={props.onCreate}>
              <span aria-hidden="true">+</span>
              Create Window
            </Button>
          </div>
        ) : null}

        {props.status !== "loading" && props.status !== "error" && props.sessions.length > 0 ? (
          <div id="sessions" className="session-grid">
            {props.sessions.map((session, index) => {
              const preview = props.previews[session.id] ?? {
                text: "Loading preview…",
                status: "loading" as const,
              };
              const pane = firstPaneForSession(props.snapshot, session.id);
              const name = session.name || `Window ${index + 1}`;
              const titleId = `session-title-${session.id}`;
              const summaryId = `session-summary-${session.id}`;

              return (
                <div
                  key={session.id}
                  className={`session-card ${session.id === props.selectedSession ? "selected" : ""}`}
                  data-session-card={session.id}
                >
                  <span className="session-card-bar">
                    <span className="session-card-name" id={titleId}>
                      {index}: {name}
                    </span>
                    <span className="session-card-controls">
                      <span className="active-badge">{session.attached ? "Attached" : "Detached"}</span>
                      <button
                        className="session-delete-button"
                        type="button"
                        aria-label={`Delete ${name}`}
                        onClick={() => props.onDelete(session.id)}
                      >
                        ×
                      </button>
                    </span>
                  </span>
                  <button
                    className={`session-open-button ${session.id === props.selectedSession ? "selected" : ""}`}
                    type="button"
                    data-session-open={session.id}
                    aria-labelledby={titleId}
                    aria-describedby={summaryId}
                    onClick={() => props.onOpen(session.id)}
                  >
                    <span className="session-preview-pane">
                      <span className="session-id-label">ID: {session.id}</span>
                      <span className="session-preview-summary" id={summaryId}>
                        {pane?.currentPath ?? "No path"}{" "}
                        {pane?.currentCommand ? `• ${pane.currentCommand}` : "• Waiting for output…"}
                      </span>
                      {preview.status === "ready" ? (
                        <pre className="session-preview-text">{preview.text}</pre>
                      ) : (
                        <TerminalPreviewFallback
                          command={pane?.currentCommand}
                          path={pane?.currentPath}
                        />
                      )}
                    </span>
                  </button>
                </div>
              );
            })}

            <Button className="create-window-card" type="button" onPress={props.onCreate}>
              <span className="create-window-plus" aria-hidden="true">
                +
              </span>
              <span>Create Window</span>
            </Button>
          </div>
        ) : null}
      </main>

      {props.sessions.length > 0 ? (
        <footer className="dashboard-footer">
          <div className="footer-tabs">
            {props.sessions.map((session, index) => (
              <button key={session.id} type="button" onClick={() => props.onOpen(session.id)}>
                <span>[{index}]</span> {session.name}
              </button>
            ))}
          </div>
          <div className="footer-status">
            <span>Selected: {selectedSessionName}</span>
            <span>{time}</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

function TerminalPreviewFallback(props: { command: string | undefined; path: string | undefined }) {
  return (
    <span className="terminal-preview-fallback">
      <span>{props.path ?? "~"}</span>
      <span>$ {props.command ?? "Waiting for output…"}</span>
      <span>Preview unavailable</span>
    </span>
  );
}

function currentTime() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
