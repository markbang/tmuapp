import type React from "react";

export function followTerminalOutput(
  element: HTMLElement | null,
  followRef: React.MutableRefObject<boolean>,
) {
  followRef.current = true;
  scrollTerminalToBottom(element);
}

export function scrollTerminalToBottomIfFollowing(element: HTMLElement, shouldFollow: boolean) {
  if (shouldFollow) {
    scrollTerminalToBottom(element);
  }
}

export function scrollTerminalToBottom(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  const scroll = () => {
    element.scrollTop = element.scrollHeight;
  };

  scroll();
  requestAnimationFrame(scroll);
  window.setTimeout(() => {
    scroll();
    requestAnimationFrame(scroll);
  }, 0);
}

export function isScrolledToBottom(element: HTMLElement) {
  return terminalBottomGap(element) <= 2;
}

export function isScrolledNearTop(element: HTMLElement) {
  return element.scrollTop <= 2;
}

function terminalBottomGap(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
}
