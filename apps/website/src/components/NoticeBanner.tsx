import { Alert } from "@heroui/react/alert";
import { Button } from "@heroui/react/button";

type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  body?: string;
};

export function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <Alert
      className={`notice ${notice.tone}`}
      status={notice.tone === "danger" ? "danger" : "success"}
      role="alert"
      aria-live="assertive"
    >
      <Alert.Content>
        <Alert.Title>{notice.title}</Alert.Title>
        {notice.body ? <Alert.Description>{notice.body}</Alert.Description> : null}
      </Alert.Content>
      <Button
        className="ghost notice-close"
        type="button"
        onPress={onDismiss}
        aria-label="Dismiss notification"
      >
        Close
      </Button>
    </Alert>
  );
}
