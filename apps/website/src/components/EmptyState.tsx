import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";

export function EmptyState(props: {
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
