import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";

export function SessionComposer(props: {
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
