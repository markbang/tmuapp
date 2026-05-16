import { Spinner } from "@heroui/react/spinner";

export function InlineLoading({ label }: { label: string }) {
  return (
    <div className="inline-loading" role="status" aria-live="polite">
      <Spinner size="sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
