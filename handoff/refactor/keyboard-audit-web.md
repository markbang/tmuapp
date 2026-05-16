# Web Terminal Keyboard Input Audit

## Scope

- `apps/website/src/main.tsx` — keyboard shortcuts, sendKey/sendInput/sendTerminalData, Tab handler, onData callback chain
- `apps/website/src/terminal/terminal-adapter.ts` — xterm.js onKey forwarding logic
- `apps/api/src/tmux.ts` — backend sendKeys/sendInput (tmux send-keys wrappers)
- `apps/api/src/server.ts` — WebSocket message dispatch for input/resize
- `apps/api/src/tmux-stream.ts` — control-mode stream handling

---

## Files Retrieved

1. **`apps/website/src/terminal/terminal-adapter.ts`** (lines 61-70) — onKey handler that forwards control chars & escape sequences to onData
2. **`apps/website/src/main.tsx`** (lines 93-95) — terminalDataHandler ref wired to onData
3. **`apps/website/src/main.tsx`** (lines 228-254) — sendTerminalData (WebSocket fast path vs HTTP fallback)
4. **`apps/website/src/main.tsx`** (lines 195-212) — sendKeys (named keys via HTTP)
5. **`apps/website/src/main.tsx`** (lines 214-241) — sendInput (text + Enter via HTTP)
6. **`apps/website/src/main.tsx`** (lines 243-251) — sendInputKey (composes sendInput + sendKeys)
7. **`apps/website/src/main.tsx`** (lines 434-500) — Keyboard shortcuts useEffect (Alt+1-9, Alt+Arrows, Ctrl+Alt+Arrows, Ctrl+L)
8. **`apps/website/src/main.tsx`** (lines 891-902) — Tab key onKeyDown handler in HTML input row
9. **`apps/api/src/tmux.ts`** (lines 93-107) — sendInput (send-keys -l) and sendKeys (send-keys with named keys)
10. **`apps/api/src/server.ts`** (lines 196-207) — WebSocket message dispatch for "input" type → `send-keys -l`
11. **`apps/api/src/tmux-stream.ts`** (full) — tmux control-mode stream piping

---

## CRITICAL BUG: Double-Send for All Control Characters & Escape Sequences

### Root Cause

**File: `apps/website/src/terminal/terminal-adapter.ts`, lines 61-70**

```typescript
if (options.onData) {
  // onData fires for printable characters and Enter only.
  term.onData(options.onData);
  // onKey fires for every keystroke. Use it to forward special keys
  // (ArrowUp, Backspace, Ctrl+C, etc.) that onData does not capture.
  term.onKey(({ key }) => {
    if (key.length > 0) {
      const code = key.charCodeAt(0);
      // Skip printable chars (>=32) and Enter (13) — onData handles them.
      if (code >= 32 || code === 13) return;
      // Forward control chars and escape sequences.
      options.onData?.(key);
    }
  });
}
```

The comment is **incorrect**. xterm.js `onData` fires for **ALL** terminal output bytes, including control characters (codes < 32), Backspace (`\x7f`), Tab (`\t`), and multi-byte escape sequences (`\x1b[A`, `\x1b[3~`, etc.). It is NOT limited to printable characters and Enter.

Because both `onData` and the `onKey`->`onData` forwarding are active, every non-printable, non-Enter keystroke is sent **twice**.

### Affected Keys (complete list)

| Key                     | xterm.js `key` value | `code` | onData sends? | onKey forwards? | Result           |
| ----------------------- | -------------------- | ------ | ------------- | --------------- | ---------------- |
| Ctrl+A                  | `\x01`               | 1      | ✅            | ✅              | **DOUBLE**       |
| Ctrl+B                  | `\x02`               | 2      | ✅            | ✅              | **DOUBLE**       |
| Ctrl+C                  | `\x03`               | 3      | ✅            | ✅              | **DOUBLE**       |
| Ctrl+D                  | `\x04`               | 4      | ✅            | ✅              | **DOUBLE**       |
| Ctrl+E                  | `\x05`               | 5      | ✅            | ✅              | **DOUBLE**       |
| ... all Ctrl+letter ... |                      |        |               |                 |                  |
| Ctrl+L                  | `\x0c`               | 12     | ✅            | ✅              | **DOUBLE**       |
| Ctrl+U                  | `\x15`               | 21     | ✅            | ✅              | **DOUBLE**       |
| Ctrl+W                  | `\x17`               | 23     | ✅            | ✅              | **DOUBLE**       |
| Ctrl+Z                  | `\x1a`               | 26     | ✅            | ✅              | **DOUBLE**       |
| Escape                  | `\x1b`               | 27     | ✅            | ✅              | **DOUBLE**       |
| Tab                     | `\t`                 | 9      | ✅            | ✅              | **DOUBLE**       |
| Backspace               | `\x7f`               | 127    | ✅            | ❌ (code >= 32) | Single (correct) |
| Delete                  | `\x1b[3~`            | 27     | ✅            | ✅              | **DOUBLE**       |
| Arrow Up                | `\x1b[A`             | 27     | ✅            | ✅              | **DOUBLE**       |
| Arrow Down              | `\x1b[B`             | 27     | ✅            | ✅              | **DOUBLE**       |
| Arrow Right             | `\x1b[C`             | 27     | ✅            | ✅              | **DOUBLE**       |
| Arrow Left              | `\x1b[D`             | 27     | ✅            | ✅              | **DOUBLE**       |
| Home                    | `\x1b[H`             | 27     | ✅            | ✅              | **DOUBLE**       |
| End                     | `\x1b[F`             | 27     | ✅            | ✅              | **DOUBLE**       |
| PageUp                  | `\x1b[5~`            | 27     | ✅            | ✅              | **DOUBLE**       |
| PageDown                | `\x1b[6~`            | 27     | ✅            | ✅              | **DOUBLE**       |
| F1                      | `\x1bOP`             | 27     | ✅            | ✅              | **DOUBLE**       |
| F2-F12                  | `\x1b[...`           | 27     | ✅            | ✅              | **DOUBLE**       |
| Insert                  | `\x1b[2~`            | 27     | ✅            | ✅              | **DOUBLE**       |
| Alt+b                   | `\x1bb`              | 27     | ✅            | ✅              | **DOUBLE**       |
| Alt+f                   | `\x1bf`              | 27     | ✅            | ✅              | **DOUBLE**       |
| Alt+.                   | `\x1b.`              | 27     | ✅            | ✅              | **DOUBLE**       |

Only keys with `code >= 32` (printable) or `code === 13` (Enter) are **not** double-sent because the onKey filter returns early for them.

**Printable characters (a-z, 0-9, symbols): single send ✅ — correct.**

### Concrete Impact

- **Ctrl+C**: SIGINT sent twice → foreground process receives two interrupts. If the process exits on first SIGINT, the second `\x03` may be buffered in the shell's input, potentially executing the next command immediately.
- **Arrow keys**: Each press moves cursor/scrolls history **twice** → jumps two entries in shell history, moves two characters in vim.
- **Ctrl+D**: EOF sent twice → may close two nested shells or cause unexpected disconnects.
- **Ctrl+Z**: Two SIGTSTP signals → process may stop and become unresponsive.
- **Tab**: Two tabs inserted instead of one.
- **Delete**: Deletes two characters instead of one.

### Backend Confirmation

Each call to `sendTerminalData` reaches the backend as a separate `tmux send-keys -t {target} -l {data}` command:

```
# What happens for Ctrl+C in the browser:
tmux send-keys -t %1 -l $'\x03'   # from onKey forwarding
tmux send-keys -t %1 -l $'\x03'   # from xterm.js onData
```

Two independent `tmux send-keys` processes run, injecting `\x03` twice.

### Fix Direction

The `onKey` handler needs to either:

1. **Call `preventDefault()` equivalent** — but xterm.js v6 `onKey` does not provide a cancellation mechanism.
2. **Remove `onKey` entirely and rely solely on `onData`** — since `onData` already fires for ALL keys, the `onKey` handler is redundant. This is the simplest fix.
3. **Keep `onKey` but remove `onData`** — use only the `onKey` handler to forward ALL keys (remove the `code >= 32 || code === 13` filter so it handles everything). This would also work but is more complex.

---

## BUG: Ctrl+L Dual Behavior (Clear Screen + Focus Input)

### Root Cause

**File: `apps/website/src/main.tsx`, lines 485-493**

```typescript
// Ctrl+L: focus the pane input line
if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key === "l") {
  e.preventDefault();
  const input = document.querySelector<HTMLInputElement>('input[name="pane-input"]');
  if (input) {
    input.focus();
    input.select();
  }
}
```

This handler is on `window.addEventListener("keydown", ...)` in the **bubbling phase**.

xterm.js processes Ctrl+L **before** the event bubbles to `window`:

1. xterm.js `onKey` fires → forwards `\x0c` to tmux
2. xterm.js `onData` fires → sends `\x0c` to tmux **again** (double-send bug above)
3. Window-level handler fires → `e.preventDefault()` → focuses input field

`e.preventDefault()` at the window level does NOT stop xterm.js from processing the key, because xterm.js's handler runs on the terminal element in an earlier bubbling phase.

**Result**: Ctrl+L clears the tmux screen AND focuses the HTML input field. Two conflicting behaviors happen simultaneously.

### Fix Direction

The keyboard shortcut check needs to happen at the **capture phase** (before xterm.js) OR the xterm.js `onKey` handler needs to intercept Ctrl+L:

Option A: Use capture phase:

```typescript
window.addEventListener("keydown", handleKeyDown, true); // capture phase
```

Option B: Handle Ctrl+L in terminal-adapter.ts's onKey handler before it reaches xterm.js processing.

---

## BUG: Keyboard Shortcuts Potentially Blocked When Terminal Has Focus

### Root Cause

**File: `apps/website/src/main.tsx`, lines 438-444**

```typescript
const active = document.activeElement;
if (
  active instanceof HTMLInputElement ||
  active instanceof HTMLTextAreaElement ||
  active instanceof HTMLSelectElement
) {
  return;
}
```

xterm.js v6 uses an internal `<textarea>` for capturing keyboard input. When the terminal is focused (user clicks on it), xterm.js calls `textarea.focus()` on its hidden textarea. `document.activeElement` becomes that textarea.

`active instanceof HTMLTextAreaElement` → `true` → handler returns early → **ALL keyboard shortcuts are silently disabled** when the terminal is focused.

Affected shortcuts when terminal is focused:

- Alt+1..9 (switch window)
- Alt+ArrowLeft/Right (prev/next window)
- Ctrl+Alt+ArrowLeft/Right (prev/next pane)
- Ctrl+L (focus input — ironically the one shortcut that specifically needs terminal focus)

### Verification

This bug manifests or doesn't depending on how xterm.js manages focus internally. In xterm.js v6, `focus()` focuses a hidden `<textarea>`. The `screenReaderMode: true` option adds another textarea. Either way, an `HTMLTextAreaElement` is likely to be the active element.

If shortcuts DO currently work when the terminal is focused, it may be because:

- The terminal container div receives focus instead of the textarea in some focus path
- Browser-specific behavior differences

### Fix Direction

Replace the blocklist with an allowlist:

```typescript
// Only activate when the terminal area or its children have focus
const terminal = document.getElementById("terminal");
if (!terminal || !terminal.contains(active)) {
  return;
}
```

Or check if `active` is inside `#terminal` or is the terminal itself, rather than excluding textareas.

---

## ISSUE: Tab Handling Complexity

### Two Separate Tab Paths

**Path 1: HTML input row Tab** (`main.tsx`, lines 891-902)

```typescript
onKeyDown={(event) => {
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        void sendInputKey("Tab", inputValue);  // sends input text + Enter, then Tab as named key via HTTP
    }
}}
```

This sends Tab as the **named key** `"Tab"` through HTTP `/api/panes/{id}/keys`, which runs `tmux send-keys -t {target} Tab`.

**Path 2: Terminal-embedded Tab** (when xterm.js is focused)
Tab goes through the double-send path described above: `\t` sent twice via WebSocket → `tmux send-keys -t {target} -l $'\t'` called twice.

### Issue

When the terminal is focused and user presses Tab, they get two tabs. When the HTML input is focused, Tab is intentionally intercepted but only sends via HTTP (as a named key), not WebSocket. The two paths are inconsistent.

---

## ISSUE: onKey Handler Cannot Cancel Key Processing

**File: `apps/website/src/terminal/terminal-adapter.ts`, lines 65-70**

The `onKey` handler does not call any cancellation mechanism. xterm.js v6's `onKey` fires before processing, but the event object `{ key, domEvent }` doesn't offer a `preventDefault()` that stops xterm.js's internal processing.

This means even if the `onKey` handler forwards the key, xterm.js will STILL process it and fire `onData`. There is no way to "intercept and handle" a key from `onKey` alone — `onData` will always also fire.

---

## Flow Diagram: Complete Keyboard Input Path

```
User types in xterm.js
        │
        ├── onKey({ key, domEvent }) fires                ← terminal-adapter.ts:65
        │   │
        │   ├── key.length === 0? (modifier-only) → skip
        │   ├── code >= 32? (printable) → skip
        │   ├── code === 13? (Enter) → skip
        │   └── else → options.onData(key)                ← THIS IS THE DOUBLE-SEND SOURCE
        │              │
        │              └── sendTerminalData(key)
        │                     │
        │                     ├── WebSocket OPEN? → sendCommand("input", key)
        │                     └── WebSocket CLOSED? → HTTP POST /api/panes/{id}/input {data: key}
        │
        └── xterm.js processes key → onData(key) fires    ← terminal-adapter.ts:63
               │
               └── sendTerminalData(key)                   ← SECOND SEND, SAME DATA
                      │
                      ├── WebSocket OPEN? → sendCommand("input", key)
                      └── WebSocket CLOSED? → HTTP POST /api/panes/{id}/input {data: key}

Backend (WebSocket):
    socket.on("message") → JSON.parse → { type: "input", data }
    → runSocketCommand(socket, runCommand, ["send-keys", "-t", target, "-l", data])
    → spawn: tmux send-keys -t {target} -l {data}

Backend (HTTP):
    POST /api/panes/{id}/input { data }
    → tmux.sendInput(target, data)
    → spawn: tmux send-keys -t {target} -l {data}
```

---

## Start Here

Begin with **`apps/website/src/terminal/terminal-adapter.ts`, lines 61-70** — this is the root cause of the double-send bug. Fixing the onKey/onData duplication resolves the most critical issue.

Then fix **`apps/website/src/main.tsx`, lines 434-500** — keyboard shortcuts effect for Ctrl+L dual behavior and textarea focus guard.
