import { Button } from "@heroui/react/button";
import type { TmuxSnapshot, TmuxWindow } from "utils";
import { windowTabId } from "../tmux-helpers";

export function WindowStrip(props: {
  windows: TmuxWindow[];
  selectedWindow: string | undefined;
  onSelect: (windowId: string) => void;
  snapshot: TmuxSnapshot | undefined;
  paneActivity: Record<string, number>;
}) {
  if (props.windows.length === 0) {
    return <div className="window-strip empty-line">No windows in selected session</div>;
  }

  const now = Date.now();

  return (
    <div className="window-strip" role="tablist" aria-label="Windows">
      {props.windows.map((window) => {
        const isSelected = window.id === props.selectedWindow;
        // Show activity dot when the window is not selected and any of
        // its panes had output within the last 3 seconds.
        const windowPanes = props.snapshot?.panes[window.id] ?? [];
        const hasRecentActivity =
          !isSelected && windowPanes.some((p) => (props.paneActivity[p.id] ?? 0) > now - 3000);

        return (
          <Button
            key={window.id}
            id={windowTabId(window.id)}
            className={`window-tab ${isSelected ? "selected" : ""}`}
            aria-selected={isSelected}
            aria-controls="terminal-panel"
            type="button"
            onPress={() => props.onSelect(window.id)}
          >
            <span>
              {window.index}:{window.name}
            </span>
            <small>{window.panes}</small>
            {hasRecentActivity ? <span className="window-activity-dot" aria-hidden="true" /> : null}
          </Button>
        );
      })}
    </div>
  );
}
