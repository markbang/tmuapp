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
  await expect.poll(() => keyPayloads.flat()).toContain("Enter");
  await expect.poll(() => resizePayloads.length).toBeGreaterThan(0);
});

test("wterm resize updates the tmux pane dimensions", async ({ page }) => {
  const resizePayloads: Array<{ width: number; height: number }> = [];

  await page.setViewportSize({ width: 1280, height: 820 });
  await mockTmuxApi(page, { inputPayloads: [], keyPayloads: [], resizePayloads });
  await openSessionManager(page);
  await expect(page.locator("#terminal")).toContainText("ready");
  await expect.poll(() => resizePayloads.length).toBeGreaterThan(0);

  const before = resizePayloads.at(-1);
  await page.setViewportSize({ width: 980, height: 720 });
  await expect.poll(() => resizePayloads.at(-1)).not.toEqual(before);
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

async function openSessionManager(page: Page) {
  await page.goto("/");
  const sessionCard = page.locator("[data-session-card]").first();
  await expect(sessionCard).toContainText("work");
  await expect(sessionCard).toContainText("from mocked tmux");
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
) {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: snapshot });
  });

  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({
      json: {
        target: "%1",
        ansi: "\u001b[32mready\u001b[0m\r\nprompt> waiting\r\nfrom mocked tmux",
        lines: 240,
        terminal: { rows: 34, columns: 120, cursorRow: 1, cursorColumn: 8 },
      },
    });
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

async function expectTerminalCursorNearPrompt(page: Page) {
  await expect.poll(async () => page.locator(".term-cursor").count()).toBe(1);
  const cursor = page.locator(".term-cursor");
  const promptRow = page.locator(".term-row").filter({ hasText: "prompt> waiting" });

  await expect(promptRow).toHaveCount(1);

  const [cursorBox, promptBox] = await Promise.all([cursor.boundingBox(), promptRow.boundingBox()]);

  expect(cursorBox).not.toBeNull();
  expect(promptBox).not.toBeNull();

  expect(Math.abs(cursorBox!.y - promptBox!.y)).toBeLessThan(3);
  expect(cursorBox!.x - promptBox!.x).toBeGreaterThan(40);
}
