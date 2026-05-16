import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { useEffect, useRef } from "react";
import { getFocusableElements, handleDialogKeyDown } from "../focus-trap";

export function TokenPanel(props: {
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

export function useFocusTrap<T extends HTMLElement>() {
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
