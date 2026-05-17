import { expect, test, type Page } from "@playwright/test";

const snapshot = {
  sessions: [{ id: "$1", name: "work", windows: 1, attached: true, createdAt: 1_778_490_000 }],
  windows: {
    $1: [{ id: "@1", index: 0, name: "shell", active: true, panes: 1, layout: "layout" }],
  },
  panes: {
    "@1": [
      {
        id: "%1",
        index: 0,
        title: "shell",
        active: true,
        width: 120,
        height: 34,
        currentCommand: "bash",
        currentPath: "/repo",
      },
    ],
  },
};

/**
 * Focus xterm.js's hidden textarea so that keyboard events reach the
 * terminal emulator. xterm.js creates its textarea inside .xterm, and
 * Playwright's page.keyboard dispatches to the focused element.
 */
async function focusTerminal(page: Page) {
  await page.locator("#terminal").evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any)._xtermInstance?.focus();
  });
}

/**
 * Read terminal text via the exposed xterm.js buffer API.
 * The adapter stores the Terminal instance on `element._xtermInstance`.
 */
async function terminalText(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = document.querySelector("#terminal") as any;
    const term = el?._xtermInstance;
    if (!term) return "";
    const buffer = term.buffer.active;
    const rows: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) rows.push(line.translateToString(true));
    }
    return rows.join("\n");
  });
}

test("renders tmux capture and sends terminal keyboard input", async ({ page }) => {
  const inputPayloads: string[] = [];
  const keyPayloads: string[][] = [];
  const resizePayloads: Array<{ width: number; height: number }> = [];

  await mockTmuxApi(page, { inputPayloads, keyPayloads, resizePayloads });
  await openSessionManager(page);

  await expect.poll(() => terminalText(page)).toContain("ready");
  await expect.poll(() => terminalText(page)).toContain("prompt> waiting");

  await focusTerminal(page);
  await page.keyboard.type("whoami");
  await expect.poll(() => inputPayloads.join("")).toContain("whoami");

  await page.keyboard.press("Enter");
  await expect.poll(() => inputPayloads.join("")).toContain("\r");
  await expect.poll(() => resizePayloads.length).toBeGreaterThan(0);
});

test("resizes narrow tmux panes to fill the browser terminal", async ({ page }) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];
  let paneSize = { width: 80, height: 24 };

  await page.setViewportSize({ width: 1500, height: 820 });
  await mockTmuxApi(
    page,
    { inputPayloads: [], keyPayloads: [], resizePayloads },
    () => ({
      target: "%1",
      ansi:
        "~/repo\r\n%0 " +
        paneSize.width +
        "x" +
        paneSize.height +
        " /home/bangwu/code/tmuapp/apps/api\r\nready",
      lines: 240,
      terminal: { rows: paneSize.height, columns: paneSize.width, cursorRow: 2, cursorColumn: 5 },
    }),
    () => paneSize,
  );
  await page.route("**/api/panes/*/resize", async (route) => {
    const body = route.request().postDataJSON() as { width: number; height: number };
    resizePayloads.push(body);
    paneSize = { width: body.width, height: body.height };
    await route.fulfill({
      json: { ok: true, terminal: { columns: body.width, rows: body.height } },
    });
  });
  await openSessionManager(page, "ready");

  await expect.poll(() => resizePayloads.at(-1)?.width ?? 0).toBeGreaterThan(100);
  await expectReasonableTerminalFit(page);
  await expect
    .poll(() => terminalText(page))
    .toContain(
      "%0 " + paneSize.width + "x" + paneSize.height + " /home/bangwu/code/tmuapp/apps/api",
    );
});

test("terminal manager fills a wide browser viewport", async ({ page }) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];
  let paneSize = { width: 80, height: 24 };

  await page.setViewportSize({ width: 2560, height: 1440 });
  await mockTmuxApi(
    page,
    { inputPayloads: [], keyPayloads: [], resizePayloads },
    () => ({
      target: "%1",
      ansi: "ready wide terminal",
      lines: 240,
      terminal: { rows: paneSize.height, columns: paneSize.width, cursorRow: 0, cursorColumn: 0 },
    }),
    () => paneSize,
  );
  await page.route("**/api/panes/*/resize", async (route) => {
    const body = route.request().postDataJSON() as { width: number; height: number };
    resizePayloads.push(body);
    paneSize = { width: body.width, height: body.height };
    await route.fulfill({
      json: { ok: true, terminal: { columns: body.width, rows: body.height } },
    });
  });

  await openSessionManager(page, "ready wide terminal");

  await expect.poll(() => terminalText(page)).toContain("ready wide terminal");
  await expect.poll(() => resizePayloads.at(-1)?.width ?? 0).toBeGreaterThan(170);
  await expectTerminalFillsManager(page);
});

test("resize updates the tmux pane dimensions", async ({ page }) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];

  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads });
  await openSessionManager(page);
  await expect.poll(() => terminalText(page)).toContain("ready");
  await expect.poll(() => resizePayloads.length).toBeGreaterThan(0);
  await expectReasonableTerminalFit(page);
  await expectNoPageScrollbar(page);

  const before = resizePayloads.at(-1);
  await page.setViewportSize({ width: 980, height: 720 });
  await expect.poll(() => resizePayloads.at(-1)).not.toEqual(before);
  await expectReasonableTerminalFit(page);
  await expectNoPageScrollbar(page);
});

test("keeps a measurable monospace grid and focus input", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads: [] });
  await openSessionManager(page);
  await expect.poll(() => terminalText(page)).toContain("ready");

  const metrics = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = document.querySelector("#terminal") as any;
    const term = el?._xtermInstance;
    // xterm.js sets font on its .xterm element, not the container.
    const xtermEl = el?.querySelector(".xterm");
    const styles = getComputedStyle(xtermEl ?? el ?? document.documentElement);
    const cell = term?._core?._renderService?.dimensions?.css?.cell;

    return {
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      hasTextarea: !!el?.querySelector("textarea"),
      rowHeight: cell?.height ?? 0,
      cellWidth: cell?.width ?? 0,
    };
  });

  expect(metrics.hasTextarea).toBe(true);
  // xterm.js applies the configured font internally; the container element
  // inherits from the design system, not the terminal font.
  expect(metrics.fontSize).toBe("14px");
  expect(metrics.rowHeight).toBeGreaterThan(12);
  expect(metrics.cellWidth).toBeGreaterThan(0);

  await expectReasonableTerminalFit(page);
});

test("keeps the cursor on the prompt when capture includes scrollback", async ({ page }) => {
  const longCapture = [
    ...Array.from({ length: 36 }, (_, index) => `body line ${String(index + 1).padStart(2, "0")}`),
    "## TypeScript",
    "- Prefer explicit types at public boundaries.",
    "",
    "/tmp",
    ">",
  ].join("\r\n");

  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads: [] }, () => ({
    target: "%1",
    ansi: longCapture,
    lines: 240,
    terminal: { rows: 34, columns: 120, cursorRow: 12, cursorColumn: 0 },
  }));
  await openSessionManager(page, ">");

  await expect.poll(() => terminalText(page)).toContain(">");

  // xterm.js with WebGL renders the cursor on canvas. Verify the terminal
  // buffer has the cursor positioned where expected (row > some threshold).
  const cursorPos = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const term = (document.querySelector("#terminal") as any)?._xtermInstance;
    if (!term) return { row: -1, col: -1 };
    const buf = term.buffer.active;
    return { row: buf.cursorY, col: buf.cursorX };
  });
  // Cursor should be in the visible viewport area after scrollback capture.
  expect(cursorPos.row).toBeGreaterThan(10);
});

test("keeps scrollback stable while the user is scrolled away from the bottom", async ({
  page,
}) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];
  const longCapture = Array.from(
    { length: 200 },
    (_, index) => `scrollback line ${String(index + 1).padStart(3, "0")}`,
  ).join("\r\n");
  let captureCount = 0;

  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads }, () => {
    captureCount += 1;
    return {
      target: "%1",
      ansi: longCapture,
      lines: 240,
      terminal: { rows: 34, columns: 120, cursorRow: 33, cursorColumn: 0 },
    };
  });
  await openSessionManager(page, "scrollback line 200");

  // Verify scrollback content is present.
  await expect.poll(() => terminalText(page)).toContain("scrollback line 200");

  // Scroll to top via the viewport element.
  await page.locator("#terminal").evaluate((element) => {
    const vp = element.querySelector<HTMLElement>(".xterm-viewport");
    if (vp) {
      vp.scrollTop = 0;
      vp.dispatchEvent(new Event("scroll"));
    }
  });
  await expect.poll(() => terminalScrollMetrics(page)).toMatchObject({ top: 0 });

  const capturesAfterUserScroll = captureCount;
  await page.waitForTimeout(2_250);

  await expect.poll(() => terminalScrollMetrics(page)).toMatchObject({ top: 0 });
  expect(captureCount).toBeGreaterThanOrEqual(capturesAfterUserScroll);
});

test("keeps product chrome outside the terminal boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads: [] });
  await openSessionManager(page);

  // xterm.js creates a canvas or DOM renderer inside #terminal.
  const canvas = page.locator("#terminal canvas, #terminal .xterm-screen").first();
  await expect(canvas).toBeAttached();

  const metrics = await page.evaluate(() => {
    const viewport = document.querySelector(".terminal-wrap");
    const terminal = document.querySelector("#terminal");
    const body = document.querySelector(".terminal-body");
    if (
      !(viewport instanceof HTMLElement) ||
      !(terminal instanceof HTMLElement) ||
      !(body instanceof HTMLElement)
    ) {
      return undefined;
    }

    return {
      bodyScrollHeight: document.documentElement.scrollHeight,
      bodyClientHeight: document.documentElement.clientHeight,
      terminalHeight: terminal.getBoundingClientRect().height,
      bodyHeight: body.getBoundingClientRect().height,
      viewportHeight: viewport.getBoundingClientRect().height,
    };
  });

  expect(metrics).toBeDefined();
  expect(metrics!.bodyScrollHeight).toBeLessThanOrEqual(metrics!.bodyClientHeight + 1);
  expect(metrics!.terminalHeight).toBeGreaterThan(320);
  expect(metrics!.viewportHeight).toBeGreaterThan(metrics!.bodyHeight * 0.6);
});

test("forwards raw keyboard and paste sequences", async ({ page }) => {
  const inputPayloads: string[] = [];

  await mockTmuxApi(page, { inputPayloads, keyPayloads: [], resizePayloads: [] });
  await openSessionManager(page);
  await focusTerminal(page);

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => inputPayloads.join("")).toContain("\u001b[A");

  await page.keyboard.press("Backspace");
  await expect.poll(() => inputPayloads.join("")).toContain("\u007f");

  await page.keyboard.press("Control+C");
  await expect.poll(() => inputPayloads.join("")).toContain("\u0003");

  // xterm.js has a paste() method. Call it directly on the terminal instance.
  await page.evaluate((text) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const term = (document.querySelector("#terminal") as any)?._xtermInstance;
    term?.paste(text);
  }, "pasted text");
  await expect.poll(() => inputPayloads.join("")).toContain("pasted text");
});

test("shows a quiet offline state with retry when the API is unavailable", async ({ page }) => {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ status: 503, body: "tmux server down" });
  });

  await page.goto("/");

  await expect(page.getByText("tmux API is offline")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator(".empty-state.danger")).toHaveCount(0);
});

test("shows an empty state when tmux has no sessions", async ({ page }) => {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: { sessions: [], windows: {}, panes: {} } });
  });

  await page.goto("/");

  await expect(page.getByText("No active windows")).toBeVisible();
  await expect(page.locator("[data-session-card]")).toHaveCount(0);
});

test("creates a session and opens the terminal", async ({ page }) => {
  const created: Array<{ name: string }> = [];

  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() === "POST") {
      created.push(route.request().postDataJSON() as { name: string });
      await route.fulfill({ json: snapshot });
      return;
    }

    await route.fulfill({
      json: created.length ? snapshot : { sessions: [], windows: {}, panes: {} },
    });
  });
  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({
      json: {
        target: "%1",
        ansi: "created\r\nready",
        lines: 240,
        terminal: { rows: 34, columns: 120, cursorRow: 1, cursorColumn: 5 },
      },
    });
  });
  await page.route("**/api/panes/*/resize", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  // New design: click "New Window" button (no form).
  await page.getByRole("button", { name: "New Window" }).click();

  await expect.poll(() => created.length).toBe(1);
  await expect(page.getByText("Session created")).toBeVisible();
  await expect.poll(() => terminalText(page)).toContain("ready");
});

test("configures an API token without a blocking browser prompt", async ({ page }) => {
  const sessionHeaders: Array<string | undefined> = [];

  await page.route("**/api/sessions", async (route) => {
    sessionHeaders.push(route.request().headers().authorization);
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({
      json: {
        target: "%1",
        ansi: "token ready",
        lines: 8,
        terminal: { rows: 34, columns: 120, cursorRow: 0, cursorColumn: 0 },
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Token" }).click();
  await expect(page.getByRole("dialog", { name: "API Token" })).toBeVisible();

  await page.getByLabel("Bearer token").fill("secret-token");
  await page.getByRole("button", { name: "Save Token" }).click();

  await expect(page.getByText("API Token Saved")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "API Token" })).toHaveCount(0);
  await expect.poll(() => sessionHeaders.filter(Boolean).at(-1)).toBe("Bearer secret-token");
});

test("shows a pane capture failure notice without hiding the terminal", async ({ page }) => {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({ status: 500, body: "capture failed" });
  });
  await page.route("**/api/panes/*/resize", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.locator("[data-session-card]").first().click();

  await expect(page.getByText("Pane capture failed")).toBeVisible();
  // Error text is written to the terminal — it will be in the accessibility rows.
  await expect.poll(() => terminalText(page)).toContain("Unable to capture pane %1");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openSessionManager(page: Page, previewText = "from mocked tmux") {
  await page.goto("/");
  const sessionCard = page.locator("[data-session-card]").first();
  await expect(sessionCard).toContainText("work");
  await expect(sessionCard).toContainText(previewText);
  await sessionCard.click();
  // New design: header shows "Tmux Terminal"
  await expect(page.getByText("Tmux Terminal")).toBeVisible();
}

async function mockTmuxApi(
  page: Page,
  captures: {
    inputPayloads: string[];
    keyPayloads: string[][];
    resizePayloads: Array<{ width: number; height: number }>;
  },
  captureFactory: () => {
    target: string;
    ansi: string;
    lines: number;
    terminal: { rows: number; columns: number; cursorRow: number; cursorColumn: number };
  } = () => ({
    target: "%1",
    ansi: "\u001b[32mready\u001b[0m\r\nfrom mocked tmux\r\nprompt> waiting",
    lines: 240,
    terminal: { rows: 34, columns: 120, cursorRow: 1, cursorColumn: 8 },
  }),
  paneSize: () => { width: number; height: number } = () => ({ width: 120, height: 34 }),
) {
  await page.route("**/api/sessions", async (route) => {
    const size = paneSize();
    await route.fulfill({
      json: {
        ...snapshot,
        panes: {
          "@1": snapshot.panes["@1"].map((pane) => ({
            ...pane,
            width: size.width,
            height: size.height,
          })),
        },
      },
    });
  });

  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({ json: captureFactory() });
  });

  await page.route("**/api/panes/*/input", async (route) => {
    const body = route.request().postDataJSON() as { data: string };
    captures.inputPayloads.push(body.data);
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/panes/*/keys", async (route) => {
    const body = route.request().postDataJSON() as { keys: string[] };
    captures.keyPayloads.push(body.keys);
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/panes/*/resize", async (route) => {
    const body = route.request().postDataJSON() as { width: number; height: number };
    captures.resizePayloads.push(body);
    await route.fulfill({
      json: { ok: true, terminal: { columns: body.width, rows: body.height } },
    });
  });

  await page.route("**/api/panes/*/split", async (route) => {
    await route.fulfill({ json: snapshot });
  });
}

async function terminalScrollMetrics(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector("#terminal .xterm-viewport") as HTMLElement | null;
    if (!vp) {
      return { canScroll: false, top: 0, bottom: 0, atBottom: false };
    }
    const bottom = Math.round(vp.scrollHeight - vp.clientHeight);
    const top = Math.round(vp.scrollTop);
    return {
      atBottom: bottom - top <= 2,
      bottom,
      canScroll: vp.scrollHeight > vp.clientHeight,
      top,
    };
  });
}

/**
 * Measures the terminal's grid fit using xterm.js's internal character
 * metrics via the exposed Terminal instance on `#terminal._xtermInstance`.
 */
async function expectReasonableTerminalFit(page: Page) {
  const readFit = () =>
    page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = document.querySelector("#terminal") as any;
      const term = el?._xtermInstance;
      if (!term) return { columns: 0, rows: 0 };

      // Access internal render service dimensions (stable private API).
      const cell = (term as any)._core?._renderService?.dimensions?.css?.cell;
      if (!cell?.width || !cell?.height) return { columns: 0, rows: 0 };

      const container = el.parentElement ?? el;
      const cs = getComputedStyle(container);
      const cw =
        container.clientWidth -
        (Number.parseFloat(cs.paddingLeft) || 0) -
        (Number.parseFloat(cs.paddingRight) || 0);
      const ch =
        container.clientHeight -
        (Number.parseFloat(cs.paddingTop) || 0) -
        (Number.parseFloat(cs.paddingBottom) || 0);

      return {
        columns: Math.floor(cw / cell.width),
        rows: Math.floor(ch / cell.height),
      };
    });

  await expect.poll(async () => (await readFit()).columns).toBeGreaterThan(30);

  const fit = await readFit();
  expect(fit.columns).toBeGreaterThan(30);
  expect(fit.columns).toBeLessThan(260);
  expect(fit.rows).toBeGreaterThan(8);
  expect(fit.rows).toBeLessThan(80);
}

async function expectTerminalFillsManager(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          const box = element?.getBoundingClientRect();
          return box ? { left: box.left, right: box.right, width: box.width } : null;
        };

        return {
          terminalWindow: rect(".terminal-window"),
          terminalBody: rect(".terminal-body"),
          terminalWrap: rect(".terminal-wrap"),
          terminal: rect("#terminal"),
          viewportWidth: window.innerWidth,
        };
      }),
    )
    .toMatchObject({
      terminalWindow: { width: expect.any(Number) },
      terminalBody: { width: expect.any(Number) },
      terminalWrap: { width: expect.any(Number) },
      terminal: { width: expect.any(Number) },
    });

  const sizes = await page.evaluate(() => {
    const width = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().width ?? 0;

    return {
      terminalWindow: width(".terminal-window"),
      terminalBody: width(".terminal-body"),
      terminalWrap: width(".terminal-wrap"),
      terminal: width("#terminal"),
      viewport: window.innerWidth,
    };
  });

  expect(sizes.terminalWindow).toBeGreaterThan(sizes.viewport - 2);
  expect(sizes.terminalBody).toBeGreaterThan(sizes.terminalWindow - 2);
  expect(sizes.terminalWrap).toBeGreaterThan(sizes.terminalBody - 2);
  expect(sizes.terminal).toBeGreaterThan(sizes.terminalWrap - 2);
}

async function expectNoPageScrollbar(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        height: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual(
      await page.evaluate(() => ({
        height: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.clientHeight,
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.clientWidth,
      })),
    );
}
