import type React from "react";

/**
 * xterm.js scrolls via its internal `.xterm-viewport` element, not the
 * container passed to `Terminal.open()`. Resolve the actual scroll target.
 */
function getViewport(element: HTMLElement): HTMLElement {
  return element.querySelector<HTMLElement>(".xterm-viewport") ?? element;
}

export function followTerminalOutput(
  element: HTMLElement | null,
  followRef: React.MutableRefObject<boolean>,
) {
  followRef.current = true;
  if (element) {
    scrollTerminalToBottom(getViewport(element));
  }
}

export function scrollTerminalToBottomIfFollowing(element: HTMLElement, shouldFollow: boolean) {
  if (shouldFollow) {
    scrollTerminalToBottom(getViewport(element));
  }
}

export function scrollTerminalToBottom(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  const target = element.scrollHeight;
  if ("scrollBehavior" in document.documentElement.style) {
    element.scrollTo({ top: target, behavior: "smooth" });
  } else {
    element.scrollTop = target;
  }

  // Double-check: some browsers may not complete smooth scroll
  // in one frame, especially when content is still arriving.
  requestAnimationFrame(() => {
    if (Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) > 2) {
      element.scrollTop = element.scrollHeight;
    }
  });
}

export function isScrolledToBottom(element: HTMLElement) {
  return terminalBottomGap(getViewport(element)) <= 2;
}

export function isScrolledNearTop(element: HTMLElement) {
  return getViewport(element).scrollTop <= 2;
}

function terminalBottomGap(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
}
