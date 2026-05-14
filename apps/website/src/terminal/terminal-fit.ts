import type React from "react";

export type TerminalCellMetrics = {
  cellWidth: number;
  rowHeight: number;
};

export function waitForLayout() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function fitTerminalToContainer(
  term: {
    cols: number;
    rows: number;
    element: HTMLElement;
    resize: (columns: number, rows: number) => void;
  },
  metricsRef?: React.MutableRefObject<TerminalCellMetrics | undefined>,
) {
  const fit = measureTerminalFit(term.element, metricsRef);
  if (!fit) {
    return;
  }

  if (fit.columns !== term.cols || fit.rows !== term.rows) {
    term.resize(fit.columns, fit.rows);
  }
  // WTerm._lockHeight() sets an inline height that overrides our CSS
  // height:100%. After resize, the inline height is stale (based on the
  // old rows). Remove it so CSS height:100% takes effect and the element
  // fills the parent container correctly.
  term.element.style.height = "";
}

export function measureTerminalFit(
  element: HTMLElement,
  metricsRef?: React.MutableRefObject<TerminalCellMetrics | undefined>,
) {
  // WTerm with autoResize:false sets its own height via _lockHeight(),
  // which makes element.clientHeight reflect WTerm's desired viewport size
  // rather than the available space in the container. Measure the parent
  // instead so we resize to the actual available dimensions.
  const container = element.parentElement ?? element;
  const containerStyles = getComputedStyle(container);
  const contentWidth =
    container.clientWidth -
    (Number.parseFloat(containerStyles.paddingLeft) || 0) -
    (Number.parseFloat(containerStyles.paddingRight) || 0);
  const contentHeight =
    container.clientHeight -
    (Number.parseFloat(containerStyles.paddingTop) || 0) -
    (Number.parseFloat(containerStyles.paddingBottom) || 0);

  const metrics = metricsRef?.current ?? measureTerminalCell(element);
  if (metricsRef && !metricsRef.current) {
    metricsRef.current = metrics;
  }
  const { cellWidth, rowHeight } = metrics;

  if (contentWidth <= 0 || contentHeight <= 0 || cellWidth <= 0 || rowHeight <= 0) {
    return undefined;
  }

  return {
    columns: clamp(Math.floor(contentWidth / cellWidth), 20, 500),
    rows: clamp(Math.floor(contentHeight / rowHeight), 5, 200),
  };
}

export function measureTerminalCell(element: HTMLElement): TerminalCellMetrics {
  const probeRow = document.createElement("div");
  probeRow.className = "term-row";
  probeRow.style.position = "absolute";
  probeRow.style.visibility = "hidden";
  const probeCell = document.createElement("span");
  probeCell.textContent = "W";
  probeRow.appendChild(probeCell);
  element.appendChild(probeRow);
  const cellWidth = probeCell.getBoundingClientRect().width;
  const rowHeight = probeRow.getBoundingClientRect().height;
  probeRow.remove();

  return { cellWidth, rowHeight };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
