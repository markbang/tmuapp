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
}

export function measureTerminalFit(
  element: HTMLElement,
  metricsRef?: React.MutableRefObject<TerminalCellMetrics | undefined>,
) {
  // Measure the parent container for available space. The terminal element
  // (either the xterm-wrapper or the #terminal container) may not fill the
  // full container until after resize, so we use the parent's dimensions.
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
  // xterm.js creates accessibility rows in the DOM even with WebGL/Canvas
  // rendering. Use them as the primary measurement source when available.
  const xtermRows = element.querySelector<HTMLElement>(".xterm-rows");
  if (xtermRows) {
    const row = xtermRows.querySelector<HTMLElement>("div");
    if (row) {
      const rowHeight = row.getBoundingClientRect().height;
      if (rowHeight > 0) {
        // Measure cell width from the element's computed font
        const probeCell = document.createElement("span");
        probeCell.textContent = "W";
        probeCell.style.position = "absolute";
        probeCell.style.visibility = "hidden";
        const styles = getComputedStyle(element);
        probeCell.style.fontFamily = styles.fontFamily;
        probeCell.style.fontSize = styles.fontSize;
        element.appendChild(probeCell);
        const cellWidth = probeCell.getBoundingClientRect().width;
        probeCell.remove();
        if (cellWidth > 0) {
          return { cellWidth, rowHeight };
        }
      }
    }
  }

  // Fallback: generic DOM probe (used before xterm.js open() or on failure)
  const probeRow = document.createElement("div");
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
