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

test("wterm renders tmux capture and sends terminal keyboard input", async ({ page }) => {
  const inputPayloads: string[] = [];
  const keyPayloads: string[][] = [];
  const resizePayloads: Array<{ width: number; height: number }> = [];

  await mockTmuxApi(page, { inputPayloads, keyPayloads, resizePayloads });
  await openSessionManager(page);

  await expect(page.getByText("wterm ANSI")).toBeVisible();
  await expect(page.locator("#terminal")).toContainText("ready");
  await expect(page.locator("#terminal")).toContainText("prompt> waiting");
  await expect(page.locator("#terminal")).toContainText("from mocked tmux");
  await expectTerminalCursorNearPrompt(page);

  await page.locator("#terminal").click();
  await page.keyboard.type("whoami");
  await expect.poll(() => inputPayloads.join("")).toContain("whoami");

  await page.keyboard.press("Enter");
  await expect.poll(() => inputPayloads.join("")).toContain("\r");
  await expect.poll(() => resizePayloads.length).toBeGreaterThan(0);
});

test("wterm resize updates the tmux pane dimensions", async ({ page }) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];

  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads });
  await openSessionManager(page);
  await expect(page.locator("#terminal")).toContainText("ready");
  await expect.poll(() => resizePayloads.length).toBeGreaterThan(0);
  await expectReasonableTerminalFit(page);
  await expectNoPageScrollbar(page);

  const before = resizePayloads.at(-1);
  await page.setViewportSize({ width: 980, height: 720 });
  await expect.poll(() => resizePayloads.at(-1)).not.toEqual(before);
  await expectReasonableTerminalFit(page);
  await expectNoPageScrollbar(page);
});

test("wterm keeps a measurable monospace grid and focus input", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads: [] });
  await openSessionManager(page);
  await expect(page.locator("#terminal")).toContainText("ready");

  const metrics = await page.locator("#terminal").evaluate((element) => {
    const row = element.querySelector(".term-row");
    const cell = row?.querySelector("span");
    const textarea = element.querySelector("textarea");
    const styles = getComputedStyle(element);
    const rowBox = row?.getBoundingClientRect();
    const cellBox = cell?.getBoundingClientRect();

    return {
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      hasTextarea: textarea instanceof HTMLTextAreaElement,
      rowHeight: rowBox?.height ?? 0,
      cellWidth: cellBox?.width ?? 0,
    };
  });

  expect(metrics.hasTextarea).toBe(true);
  expect(metrics.fontFamily).toContain("monospace");
  expect(metrics.fontSize).toBe("14px");
  expect(metrics.rowHeight).toBeGreaterThan(12);
  expect(metrics.cellWidth).toBeGreaterThan(0);

  await expect(page.locator("#fit-size")).not.toHaveText("pending");
});

test("wterm keeps the cursor on the prompt when capture includes scrollback", async ({ page }) => {
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

  await expect(page.locator("#terminal")).toContainText(">");

  const typeScriptRow = page.locator(".term-row").filter({ hasText: "## TypeScript" });
  const [cursorBox, typeScriptBox] = await Promise.all([
    page.locator(".term-cursor").boundingBox(),
    typeScriptRow.boundingBox(),
  ]);
  expect(cursorBox).not.toBeNull();
  expect(typeScriptBox).not.toBeNull();
  expect(Math.abs(cursorBox!.y - typeScriptBox!.y)).toBeGreaterThan(20);
});

test("wterm keeps scrollback stable while the user is scrolled away from the bottom", async ({
  page,
}) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];
  const longCapture = Array.from(
    { length: 140 },
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
  await openSessionManager(page, "scrollback line 140");

  const terminal = page.locator("#terminal");
  await expect(terminal).toContainText("scrollback line 140");
  await expect.poll(() => terminalScrollMetrics(page)).toMatchObject({ canScroll: true });

  await terminal.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => terminalScrollMetrics(page)).toMatchObject({ top: 0 });

  const capturesAfterUserScroll = captureCount;
  await page.waitForTimeout(2_250);

  await expect.poll(() => terminalScrollMetrics(page)).toMatchObject({ top: 0 });
  expect(captureCount).toBe(capturesAfterUserScroll);
});

test("wterm forwards raw keyboard and paste sequences", async ({ page, context, browserName }) => {
  const inputPayloads: string[] = [];

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5173",
  });

  await mockTmuxApi(page, { inputPayloads, keyPayloads: [], resizePayloads: [] });
  await openSessionManager(page);
  await page.locator("#terminal").click();

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => inputPayloads.join("")).toContain("\u001b[A");

  await page.keyboard.press("Backspace");
  await expect.poll(() => inputPayloads.join("")).toContain("\u007f");

  await page.keyboard.press("Control+C");
  await expect.poll(() => inputPayloads.join("")).toContain("\u0003");

  await page.evaluate(() => navigator.clipboard.writeText("pasted text"));
  await (browserName === "webkit"
    ? page.keyboard.press("Meta+v")
    : page.keyboard.press("Control+v"));
  await expect.poll(() => inputPayloads.join("")).toContain("pasted text");
});

test("shows a quiet offline state with retry when the API is unavailable", async ({ page }) => {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ status: 503, body: "tmux server down" });
  });

  await page.goto("/");

  await expect(page.getByText("tmux API is offline")).toBeVisible();
  await expect(page.getByText("Start the tmux API or retry when it is available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("offline", { exact: true })).toBeVisible();
  await expect(page.getByText("Unable to reach tmux API")).toHaveCount(0);
  await expect(page.locator(".empty-state.danger")).toHaveCount(0);
});

test("shows an empty state when tmux has no sessions", async ({ page }) => {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: { sessions: [], windows: {}, panes: {} } });
  });

  await page.goto("/");

  await expect(page.getByText("No tmux sessions")).toBeVisible();
  await expect(page.getByText("Create a new session")).toBeVisible();
  await expect(page.locator("[data-session-card]")).toHaveCount(0);
});

test("creates a session from the first-run form and opens the manager", async ({ page }) => {
  const created: Array<{ name: string; cwd?: string }> = [];

  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() === "POST") {
      created.push(route.request().postDataJSON() as { name: string; cwd?: string });
      await route.fulfill({ json: snapshot });
      return;
    }

    await route.fulfill({ json: { sessions: [], windows: {}, panes: {} } });
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
  await page.getByLabel("Session name").fill("work");
  await page.getByLabel("Working directory").fill("/repo");
  await page.getByRole("button", { name: "Create" }).click();

  await expect.poll(() => created).toEqual([{ name: "work", cwd: "/repo" }]);
  await expect(page.getByText("Session created")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to sessions" })).toBeVisible();
  await expect(page.locator("#terminal")).toContainText("ready");
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

test("confirms before killing a tmux window", async ({ page }) => {
  let deleteCount = 0;

  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads: [] });
  await page.route("**/api/windows/*", async (route) => {
    if (route.request().method() === "DELETE") {
      deleteCount += 1;
    }
    await route.fulfill({ json: { ok: true } });
  });

  await openSessionManager(page);
  await page.getByRole("button", { name: "Kill Window" }).click();
  await expect(page.getByRole("dialog", { name: "Kill Window" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Kill Window" })).toHaveCount(0);
  expect(deleteCount).toBe(0);

  await page.getByRole("button", { name: "Kill Window" }).click();
  await page
    .getByRole("dialog", { name: "Kill Window" })
    .getByRole("button", {
      name: "Kill Window",
    })
    .click();

  await expect.poll(() => deleteCount).toBe(1);
  await expect(page.getByText("Window killed")).toBeVisible();
});

test("falls back to pane metadata when session preview capture fails", async ({ page }) => {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({ status: 500, body: "capture failed" });
  });

  await page.goto("/");

  const sessionCard = page.locator("[data-session-card]").first();
  await expect(sessionCard).toContainText("work");
  await expect(sessionCard.locator(".session-preview")).toContainText("bash");
  await expect(sessionCard.locator(".session-preview")).toHaveClass(/fallback/u);
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
  await expect(page.locator("#terminal")).toContainText("Unable to capture pane %1");
  await expect(page.locator("#terminal")).toContainText("capture failed");
});

async function openSessionManager(page: Page, previewText = "from mocked tmux") {
  await page.goto("/");
  const sessionCard = page.locator("[data-session-card]").first();
  await expect(sessionCard).toContainText("work");
  await expect(sessionCard).toContainText(previewText);
  await sessionCard.click();
  await expect(page.getByText("shell").first()).toBeVisible();
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
) {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: snapshot });
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
  return page.locator("#terminal").evaluate((element) => ({
    canScroll: element.scrollHeight > element.clientHeight,
    top: Math.round(element.scrollTop),
  }));
}

async function expectReasonableTerminalFit(page: Page) {
  await expect.poll(async () => page.locator("#fit-size").textContent()).not.toBe("pending");
  const fit = (await page.locator("#fit-size").textContent()) ?? "";
  const [columns, rows] = fit.split("x").map((value) => Number.parseInt(value, 10));

  expect(columns).toBeGreaterThan(30);
  expect(columns).toBeLessThan(260);
  expect(rows).toBeGreaterThan(8);
  expect(rows).toBeLessThan(80);
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

async function expectTerminalCursorNearPrompt(page: Page) {
  const promptRow = page.locator(".term-row").filter({ hasText: "prompt> waiting" });
  await expect(promptRow).toHaveCount(1);
  await expectTerminalCursorNearRow(page, promptRow);
}

async function expectTerminalCursorNearRow(page: Page, row: ReturnType<Page["locator"]>) {
  await expect.poll(async () => page.locator(".term-cursor").count()).toBe(1);
  const cursor = page.locator(".term-cursor");

  const [cursorBox, rowBox] = await Promise.all([cursor.boundingBox(), row.boundingBox()]);

  expect(cursorBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(Math.abs(cursorBox!.y - rowBox!.y)).toBeLessThan(3);
  expect(cursorBox!.x - rowBox!.x).toBeGreaterThanOrEqual(0);
}
