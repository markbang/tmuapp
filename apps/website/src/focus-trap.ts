import React from "react";

export function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
}

export function handleDialogKeyDown(event: React.KeyboardEvent, onCancel: () => void) {
  if (event.key === "Escape") {
    event.stopPropagation();
    onCancel();
  }
}
