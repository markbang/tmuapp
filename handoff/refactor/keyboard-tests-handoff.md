# Keyboard E2E Test Suite — Implementation Handoff

## What was created

`apps/website/tests/e2e/keyboard.spec.ts` — 23 tests covering all key categories.

## Test coverage

### Control Characters (6 tests)

Ctrl+A, Ctrl+C, Ctrl+D, Ctrl+U, Ctrl+W, Ctrl+Z — each verified exact count (not just contains).

### Navigation Keys (8 tests)

ArrowUp/Down/Right/Left, Home, End, PageUp, PageDown — escape sequences verified.

### Editing Keys (5 tests)

Backspace, Delete, Tab, Escape, Enter.

### Anti-Double-Send (2 tests)

- Rapid typing "hello world" — 11 keystrokes → exactly 11 payloads.
- Repeated ArrowUp ×3 → exactly 3 payloads, all matching `\x1b[A`.

### Modifier + Edge Cases (2 tests)

- Ctrl+ArrowUp → `\x1b[1;5A`
- Shift+Tab → `\x1b[Z`
- Ctrl+J → raw `\n` (line feed)

## Key pattern: exact count, not substring

```ts
const before = inputPayloads.length;
await page.keyboard.press("Control+c");
await expect.poll(() => inputPayloads.length).toBe(before + 1);
await expect.poll(() => inputPayloads.at(-1)).toBe("\u0003");
```

## Validation

- `vp check`: 0 errors across 20 files
- Tests follow same patterns as `terminal.spec.ts` (mockTmuxApi-compatible, focusTerminal helper)
