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
  const [cpuUsage, setCpuUsage] = useState(42);
  const [memUsage, setMemUsage] = useState(68);
  const [time, setTime] = useState(() => currentTime());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCpuUsage((value) => clamp(value + Math.random() * 10 - 5));
      setMemUsage((value) => clamp(value + Math.random() * 4 - 2));
      setTime(currentTime());
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-heading">
          <div className="dashboard-brand">
            <span className="online-dot" aria-hidden="true" />
            <span>Tmux Web Panel</span>
          </div>
          <div className="dashboard-divider" />
          <div className="dashboard-kicker">Manager Dash</div>
        </div>
        <div className="dashboard-actions">
          <MetricBar label="CPU" value={cpuUsage} />
          <MetricBar label="MEM" value={memUsage} />
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
              CREATE_WINDOW
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

              return (
                <Button
                  key={session.id}
                  className={`session-card ${session.id === props.selectedSession ? "selected" : ""}`}
                  data-session-card={session.id}
                  type="button"
                  aria-label={`Open session ${name}`}
                  onPress={() => props.onOpen(session.id)}
                >
                  <span className="session-card-bar">
                    <span className="session-card-name">
                      {index}: {name}*
                    </span>
                    <span className="session-card-controls">
                      <span className="active-badge">Active</span>
                      <button
                        className="session-delete-button"
                        type="button"
                        aria-label={`Delete ${name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onDelete(session.id);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </span>
                  <span className="session-preview-pane">
                    <span className="session-id-label">ID: {session.id}</span>
                    {preview.status === "ready" ? (
                      <pre className="session-preview-text">{preview.text}</pre>
                    ) : (
                      <TerminalPreviewFallback command={pane?.currentCommand} />
                    )}
                    <span className="preview-spacer" />
                    <span className="preview-tilde">~</span>
                    <span className="preview-tilde">~</span>
                  </span>
                </Button>
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
                <span>[{index}]</span> {session.name}*
              </button>
            ))}
          </div>
          <div className="footer-status">
            <span>"Ubuntu 22.04"</span>
            <span>{time}</span>
            <span className="ctrl-b-badge">CTRL-B</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

function MetricBar(props: { label: string; value: number }) {
  return (
    <div className="metric-bar">
      <span>{props.label}</span>
      <div>
        <i style={{ width: `${props.value}%` }} />
      </div>
    </div>
  );
}

function TerminalPreviewFallback(props: { command: string | undefined }) {
  return (
    <span className="terminal-preview-fallback">
      <span>
        <b>root@prod</b>:<i>~</i>$ {props.command || "ls -la"}
      </span>
      <span>total 24</span>
      <span>drwxr-xr-x 2 root root 4096</span>
      <span>-rw-r--r-- 1 root root 220</span>
      <span>
        <b>root@prod</b>:<i>~</i>$ <em />
      </span>
    </span>
  );
}

function currentTime() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}
