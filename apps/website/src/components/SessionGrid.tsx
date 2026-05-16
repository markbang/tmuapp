import { Button } from "@heroui/react/button";
import type { TmuxSession, TmuxSnapshot } from "utils";
import type { AsyncStatus, PreviewState } from "../types";
import { firstPaneForSession, panesForSession } from "../tmux-helpers";
import { EmptyState } from "./EmptyState";
import { InlineLoading } from "./InlineLoading";
import { StatusChip } from "./StatusChip";

export function SessionGrid(props: {
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
