import { expect, test, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared helpers — mirrors terminal.spec.ts pattern
// ---------------------------------------------------------------------------

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

async function openSessionManager(page: Page) {
  await page.goto("/");
  const sessionCard = page.locator("[data-session-card]").first();
  await expect(sessionCard).toContainText("work");
  await sessionCard.click();
  await expect(page.getByText("Tmux Terminal").first()).toBeVisible();
}

async function focusTerminal(page: Page) {
  await page.locator("#terminal").evaluate((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any)._xtermInstance?.focus();
  });
}

async function mockKeyboardApi(page: Page, inputPayloads: string[]) {
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ json: snapshot });
  });

  await page.route("**/api/panes/*/capture?*", async (route) => {
    await route.fulfill({
      json: {
        target: "%1",
        ansi: "\u001b[32mready\u001b[0m\r\nprompt> ",
        lines: 240,
        terminal: { rows: 34, columns: 120, cursorRow: 1, cursorColumn: 8 },
      },
    });
  });

  await page.route("**/api/panes/*/input", async (route) => {
    const body = route.request().postDataJSON() as { data: string };
    inputPayloads.push(body.data);
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/panes/*/keys", async (route) => {
    const body = route.request().postDataJSON() as { keys: string[] };
    // Record each key individually for accurate per-key assertions.
    for (const k of body.keys) {
      inputPayloads.push(k);
    }
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/panes/*/resize", async (route) => {
    const body = route.request().postDataJSON() as { width: number; height: number };
    await route.fulfill({
      json: { ok: true, terminal: { columns: body.width, rows: body.height } },
    });
  });

  await page.route("**/api/panes/*/split", async (route) => {
    await route.fulfill({ json: snapshot });
  });
}

/**
 * Assert that the key was sent EXACTLY ONCE.
 * Uses length delta, not substring search, to catch double-sends.
 */
async function assertSingleKeySent(inputPayloads: string[], expected: string, before: number) {
  // Exactly one new payload was added.
  await expect.poll(() => inputPayloads.length).toBe(before + 1);
  // The last payload matches the expected key sequence.
  await expect.poll(() => inputPayloads.at(-1)).toBe(expected);
}

// ---------------------------------------------------------------------------
// Control Characters — each must be forwarded exactly once
// ---------------------------------------------------------------------------

test("forwards Ctrl+A exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+a");
  await assertSingleKeySent(inputPayloads, "\u0001", before);
});

test("forwards Ctrl+C exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+c");
  await assertSingleKeySent(inputPayloads, "\u0003", before);
});

test("forwards Ctrl+D exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+d");
  await assertSingleKeySent(inputPayloads, "\u0004", before);
});

test("forwards Ctrl+U exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+u");
  await assertSingleKeySent(inputPayloads, "\u0015", before);
});

test("forwards Ctrl+W exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+w");
  await assertSingleKeySent(inputPayloads, "\u0017", before);
});

test("forwards Ctrl+Z exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+z");
  await assertSingleKeySent(inputPayloads, "\u001a", before);
});

// ---------------------------------------------------------------------------
// Navigation Keys
// ---------------------------------------------------------------------------

test("forwards ArrowUp exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("ArrowUp");
  await assertSingleKeySent(inputPayloads, "\u001b[A", before);
});

test("forwards ArrowDown exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("ArrowDown");
  await assertSingleKeySent(inputPayloads, "\u001b[B", before);
});

test("forwards ArrowRight exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("ArrowRight");
  await assertSingleKeySent(inputPayloads, "\u001b[C", before);
});

test("forwards ArrowLeft exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("ArrowLeft");
  await assertSingleKeySent(inputPayloads, "\u001b[D", before);
});

test("forwards Home exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Home");
  await assertSingleKeySent(inputPayloads, "\u001b[H", before);
});

test("forwards End exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("End");
  await assertSingleKeySent(inputPayloads, "\u001b[F", before);
});

test("forwards PageUp exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("PageUp");
  await assertSingleKeySent(inputPayloads, "\u001b[5~", before);
});

test("forwards PageDown exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("PageDown");
  await assertSingleKeySent(inputPayloads, "\u001b[6~", before);
});

// ---------------------------------------------------------------------------
// Editing Keys
// ---------------------------------------------------------------------------

test("forwards Backspace exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Backspace");
  await assertSingleKeySent(inputPayloads, "\u007f", before);
});

test("forwards Delete exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Delete");
  await assertSingleKeySent(inputPayloads, "\u001b[3~", before);
});

test("forwards Tab exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Tab");
  await assertSingleKeySent(inputPayloads, "\t", before);
});

test("forwards Escape exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Escape");
  await assertSingleKeySent(inputPayloads, "\u001b", before);
});

test("forwards Enter exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Enter");
  await assertSingleKeySent(inputPayloads, "\r", before);
});

// ---------------------------------------------------------------------------
// No Double-Sends (rapid typing + repeated keys)
// ---------------------------------------------------------------------------

test("rapid typing sends each character exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  // Type "hello world" character by character via press.
  const text = "hello world";
  const before = inputPayloads.length;
  for (const ch of text) {
    await page.keyboard.press(ch);
  }
  // Each character should add exactly one payload.
  await expect.poll(() => inputPayloads.length).toBe(before + text.length);
  // Reconstruct the typed text.
  await expect.poll(() => inputPayloads.slice(before).join("")).toBe(text);
});

test("repeated ArrowUp sends exactly one payload per press", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  await expect.poll(() => inputPayloads.length).toBe(before + 3);
  // Each payload is the same escape sequence.
  for (let i = 0; i < 3; i++) {
    expect(inputPayloads[before + i]).toBe("\u001b[A");
  }
});

// ---------------------------------------------------------------------------
// Modifier Keys
// ---------------------------------------------------------------------------

test("forwards Ctrl+ArrowUp with modifier code exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+ArrowUp");
  // Ctrl adds modifier 5: \x1b[1;5A
  await assertSingleKeySent(inputPayloads, "\u001b[1;5A", before);
});

test("forwards Shift+Tab (back-tab) exactly once", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Shift+Tab");
  await assertSingleKeySent(inputPayloads, "\u001b[Z", before);
});

// ---------------------------------------------------------------------------
// Newline forwarding: bare \n vs \r\n
// ---------------------------------------------------------------------------

test("forwards bare Ctrl+J (line feed) as raw \\n", async ({ page }) => {
  const inputPayloads: string[] = [];
  await mockKeyboardApi(page, inputPayloads);
  await openSessionManager(page);
  await focusTerminal(page);

  const before = inputPayloads.length;
  await page.keyboard.press("Control+j");
  // xterm.js sends LF (0x0a) for Ctrl+J.
  await assertSingleKeySent(inputPayloads, "\n", before);
});
