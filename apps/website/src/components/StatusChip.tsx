import { Chip } from "@heroui/react/chip";
import React from "react";

export function StatusChip({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return <Chip className={`status ${tone}`}>{children}</Chip>;
}
