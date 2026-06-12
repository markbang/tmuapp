import { Button } from "@heroui/react/button";
import { useFocusTrap } from "./TokenPanel";
import { handleDialogKeyDown } from "../focus-trap";

export function ConfirmSessionDelete(props: {
  isDeleting: boolean;
  sessionName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>();

  return (
    <div
      className="floating-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-session-title"
      onClick={props.onCancel}
      onKeyDown={(event) => handleDialogKeyDown(event, props.onCancel)}
    >
      <div
        ref={dialogRef}
        className="panel-card confirm-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id="delete-session-title">Delete Session</h2>
          <p>
            Session {props.sessionName} will close and its panes will be removed. This action
            cannot be undone.
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
            {props.isDeleting ? "Deleting…" : "Delete Session"}
          </Button>
        </div>
      </div>
    </div>
  );
}
