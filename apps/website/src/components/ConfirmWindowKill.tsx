import { Button } from "@heroui/react/button";
import type { TmuxWindow } from "utils";
import { useFocusTrap } from "./TokenPanel";
import { handleDialogKeyDown } from "../focus-trap";

export function ConfirmWindowKill(props: {
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
            This action cannot be undone.
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
