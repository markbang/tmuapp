# Terminal Rendering + UI Chrome — Final Implementation Plan

> Synthesized from terminal library research, codebase rendering pipeline context, and UI chrome audit.
> Date: 2026-05-15

---

## Executive Summary

**Two tracks for one release:**

1. **Terminal rendering backend swap:** `@wterm/dom` v0.3.0 (DOM-based renderer) → `@xterm/xterm` v6 + `@xterm/addon-webgl` (GPU-accelerated WebGL2). Switches from a 3rd-party DOM-grid renderer with a Zig WASM parser to the industry-standard xterm.js used in VS Code, Hyper, and Tabby. Enables native-kitty-level smoothness through GPU rendering, ligature support, and image protocol support (Kitty/Sixel).
2. **UI chrome polish:** Tokenizes ~25 hardcoded color values, fixes 2 critical accessibility blockers (Tab hijacking, ARIA tablist), differentiates hover/selected states on session cards, adds modal transitions, and cleans up visual debt across 7 component areas.

**Total estimated scope:** ~15 files touched (8 frontend sources + 5 CSS files + 1 test file + package.json). The terminal swap is the high-risk structural change; the chrome work is lower-risk CSS/JSX polish.

---

## Part 1: Terminal Rendering — Priority-Ordered Improvements

### P0: Install & Wire xterm.js v6 with WebGL Addon

**Why:** The current `@wterm/dom` uses a DOM-grid renderer (hundreds of `<span>` elements per frame) which creates 5-9x slower rendering than WebGL (xterm.js PR #1790 benchmarks). This is the single biggest lever for "native-level feel" — a GPU texture atlas is the difference between a web terminal and a native terminal.

**Decision:** xterm.js v6 + addon-webgl (not ghostty-web). Ghostty-web is pre-1.0, lacks public benchmarks, requires COOP/COEP headers, and its v0.4.0 npm package may not include the WebGPU renderer yet. xterm.js is production-battle-tested at VS Code scale.

#### 1.1 Package Installation

**File:** `apps/website/package.json`

- Add dependencies:
  - `@xterm/xterm`: `^6.1.0` (v6.x for synchronized output, shadow DOM WebGL, ESM code splitting)
  - `@xterm/addon-webgl`: `^0.19.0`
- Remove: `@wterm/dom` (after migration complete; keep during transition if phased)
- Update `pnpm-workspace.yaml` catalog entries

**Validation:** `vp install` succeeds, `pnpm ls @xterm/xterm` shows v6.x

#### 1.2 Create Terminal Adapter Layer

**New file:** `apps/website/src/terminal/terminal-adapter.ts`

This is an adapter that wraps the xterm.js `Terminal` to match the interface used by `main.tsx`. The current WTerm API surface is:

| WTerm API                 | Purpose                                          | xterm.js equivalent                      |
| ------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `new WTerm(el, opts)`     | Constructor (el + opts)                          | `new Terminal(opts)` + `term.open(el)`   |
| `term.init()`             | Async WASM load + renderer/input setup           | `await term.loadAddon(webgl)` then sync  |
| `term.write(data)`        | Push ANSI string                                 | `term.write(data)` (identical signature) |
| `term.resize(cols, rows)` | Resize grid                                      | `term.resize(cols, rows)` (identical)    |
| `term.cols`, `term.rows`  | Read dimensions                                  | `term.cols`, `term.rows` (identical)     |
| `term.element`            | DOM element ref                                  | `term.element` (identical)               |
| `term.onData(cb)`         | Forward keystrokes                               | `term.onData(cb)` (identical)            |
| `term.onResize(cb)`       | Resize notification                              | `term.onResize(cb)` (identical)          |
| `term.bridge?.init()`     | Reset emulator (called in resetTerminalSnapshot) | `term.reset()`                           |

The adapter should:

- Accept the same constructor pattern: `(element, options)` where options include `cols, rows, cursorBlink, onData, onResize`
- Return an object implementing the same interface shape
- Load the WebGL addon during init (with Canvas2D fallback if WebGL2 unavailable)
- Map `resetTerminalSnapshot` behavior to `term.reset()`
- **Not leak xterm.js types** — keep the adapter opaque so main.tsx only sees the adapter interface

```ts
// Proposed interface
export interface TerminalInstance {
  readonly cols: number;
  readonly rows: number;
  readonly element: HTMLElement;
  init(): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  reset(): void;
  dispose(): void;
}
```

**Note on `@wterm/core` TerminalCore swap:** The context documents mention WTerm accepts `core?: TerminalCore`. This is NOT the path to take — we're replacing the entire WTerm instance, not swapping its parser backend. The `TerminalCore` interface governs the parser, but we need to change the renderer too.

**Validation:**

- `TerminalAdapter` can be imported without error
- Creating an instance with mock element works (unit or quick smoke test)

#### 1.3 Update main.tsx Integration Points

**File:** `apps/website/src/main.tsx`

**Change 1 — Imports (line ~1-2):**

```ts
// Remove:
import "@wterm/dom/css";
import { WTerm } from "@wterm/dom";
// Add:
import "@xterm/xterm/css/xterm.css";
import { createTerminal, type TerminalInstance } from "./terminal/terminal-adapter";
```

**Change 2 — Refs (ensureTerminal, line ~136):**

- `terminal.current` type changes from `WTerm` to `TerminalInstance`
- `terminalReady.current` stays `Promise<void>` (init is still async due to addon loading)

**Change 3 — ensureTerminal() (lines ~130-165):**

```ts
// Replace:
terminal.current = new WTerm(element, { ... });
terminalReady.current = terminal.current.init();
// With:
terminal.current = createTerminal(element, {
  cols: columns || 120,
  rows: rows || 34,
  cursorBlink: true,
  onData: (data) => terminalDataHandler.current(data),
  onResize: scheduleResizeActivePane,
});
terminalReady.current = terminal.current.init();
```

**Change 4 — resetTerminalSnapshot() (line ~1491):**

```ts
// Replace:
function resetTerminalSnapshot(term: WTerm) {
  term.bridge?.init(term.cols, term.rows);
}
// With:
function resetTerminalSnapshot(term: TerminalInstance) {
  term.reset();
}
```

**Change 5 — All `term.write()`, `term.resize()`, `term.cols`, `term.rows`, `term.element` references:**
These have identical signatures to xterm.js. No changes needed if the adapter preserves the same property/method names. If the adapter uses TypeScript getters, update the type annotations but not the call sites.

**Change 6 — fitTerminalToContainer() (terminal-fit.ts line ~27):**
The `term.element.style.height = ""` line clears WTerm's `_lockHeight()` inline style. xterm.js does NOT set an inline height, so this line becomes a no-op and should be removed or guarded.

**Validation:**

- `vp run website#dev` starts without error
- Terminal renders ANSI capture (HTTP fallback path works)
- WebSocket stream writes output to terminal

#### 1.4 Update CSS

**File:** `apps/website/src/styles/terminal.css`

**Change:** xterm.js ships its own CSS (`@xterm/xterm/css/xterm.css`). The project's custom `.wterm` overrides must be adapted to xterm.js class names:

| @wterm/dom class        | xterm.js class           | Action                                  |
| ----------------------- | ------------------------ | --------------------------------------- |
| `.wterm`                | `.xterm`                 | Rename selectors                        |
| `.term-grid`            | `.xterm-screen`          | Rename (different structure)            |
| `.term-row`             | `.xterm-rows > div`      | Adjust                                  |
| `.term-row > span`      | `.xterm-rows span`       | Adjust                                  |
| `.term-block`           | No equivalent            | Remove                                  |
| `.term-cursor`          | `.xterm-cursor`          | Rename                                  |
| `.wterm.focused`        | `.xterm.focus`           | Rename                                  |
| `.wterm.has-scrollback` | `.xterm .xterm-viewport` | xterm.js uses separate viewport element |

**Key CSS adaptations needed:**

1. **Terminal container (`.terminal`):**

```css
.terminal {
  /* keep existing: height, overflow, background */
}

/* Override xterm.js defaults that might conflict: */
.terminal .xterm {
  height: 100%;
  padding: 8px 10px;
}
```

2. **Font & color overrides:**

```css
.terminal .xterm {
  --term-bg: #010102;
  --term-fg: #f7f8f8;
  --term-cursor: #5e6ad2;
  font-family: ui-monospace, ...;
  font-size: 14px;
  line-height: 1.2;
}
```

3. **Focus outline:**

```css
.terminal .xterm.focus {
  outline: 1px solid var(--primary-focus-ring, rgba(94, 106, 210, 0.45));
  outline-offset: -1px;
}
```

4. **Scrollback:**

```css
.terminal .xterm .xterm-viewport {
  /* xterm.js viewport is the scrollable element */
}
/* Remove old: .terminal.wterm.has-scrollback { overflow-y: auto; } */
```

5. **Cursor blink:**
   xterm.js handles `.xterm-cursor-blink` animation natively. Remove project's `.cursor-blink` animation if it conflicts.

**File:** Remove `@wterm/dom` CSS import — `import "@wterm/dom/css"` at main.tsx line 1

**Validation:**

- No visual regressions at default viewport
- Cursor renders with lavender color
- Focus outline visible
- Scrollback area scrollable
- Verify at 980px and 560px breakpoints

#### 1.5 Update terminal-fit.ts Cell Measurement

**File:** `apps/website/src/terminal/terminal-fit.ts`

The `measureTerminalCell()` function creates a probe `<div class="term-row"><span>W</span></div>` which depends on @wterm/dom's DOM structure. With xterm.js, the DOM structure is different:

- xterm.js renders into a canvas when WebGL addon is active (NO DOM rows/spans)
- With Canvas2D fallback, it renders `<div class="xterm-rows"><div>W</div></div>`

**Recommended approach:** Use xterm.js's `term._core._renderService.dimensions` to read the actual cell dimensions after the first render, rather than probing the DOM. The adapter should expose a `getCellMetrics()` method:

```ts
// In adapter or maintain a ref after first write
function getCellMetrics(term: Terminal): TerminalCellMetrics {
  // After first render, xterm.js caches dimensions
  const dims = (term as any)._core._renderService.dimensions;
  return {
    cellWidth: dims.css.cell.width,
    rowHeight: dims.css.cell.height,
  };
}
```

Alternative: Keep the probe approach but use xterm.js DOM structure. This is fragile. Prefer the dimensions API even if it requires accessing a private property — add a comment explaining why.

```ts
// Updated measureTerminalCell:
export function measureTerminalCell(element: HTMLElement): TerminalCellMetrics {
  // xterm.js uses canvas (WebGL) or div rows; probe the xterm.js structure
  const probeRow = document.createElement("div");
  probeRow.className = "xterm-rows";
  probeRow.style.position = "absolute";
  probeRow.style.visibility = "hidden";
  const probeLine = document.createElement("div");
  probeLine.textContent = "W";
  probeRow.appendChild(probeLine);
  element.appendChild(probeRow);
  const cellWidth = probeLine.getBoundingClientRect().width;
  const rowHeight = probeRow.getBoundingClientRect().height;
  probeRow.remove();
  return { cellWidth, rowHeight };
}
```

**Validation:** `fitTerminalToContainer()` produces correct cols/rows after swap. E2E resize tests pass.

#### 1.6 Update terminal-scroll.ts

**File:** `apps/website/src/terminal/terminal-scroll.ts`

xterm.js scrolls via a viewport element (`<div class="xterm-viewport">`), not the terminal element itself. Update scroll functions to target the viewport:

```ts
function getViewport(element: HTMLElement): HTMLElement {
  return element.querySelector(".xterm-viewport") ?? element;
}
```

Update `scrollTerminalToBottom`, `isScrolledToBottom`, `isScrolledNearTop` to use the viewport.

**Validation:** Auto-follow behavior works: writing output scrolls to bottom, scrolling up pauses follow, returning to bottom resumes follow.

#### 1.7 Update E2E Tests (terminal.spec.ts)

**File:** `apps/website/tests/e2e/terminal.spec.ts`

xterm.js uses Canvas for rendering when WebGL is active, which means:

- Locators like `page.locator(".term-row")` will fail
- Locators like `page.locator(".xterm-cursor")` should still work (xterm.js renders a cursor overlay element even in WebGL mode)
- Text content assertions via `toContainText` on `#terminal` may not work with Canvas rendering — xterm.js renders text to a WebGL texture, not DOM text nodes

**Action:** Audit all selectors in terminal.spec.ts:

- `.term-row` → remove (no DOM row elements with WebGL)
- `.term-cursor` → `.xterm-cursor` (should still exist as DOM overlay)
- Text assertions → either switch to screenshot comparisons with `toMatchScreenshot()` or use xterm.js's `term.buffer` API via `page.evaluate()` to read cell content programmatically

**Likely needed test rewrites:**

- `test("wterm renders tmux capture...")` — `toContainText` assertions need to be rewritten to use buffer inspection or screenshot
- `test("resizes narrow tmux panes...")` — dimensions assertions may need adjustment
- Cursor position tests — xterm.js cursor is still a DOM element, should work

**Validation:** All 16 e2e tests pass. Run `vp run website#e2e`.

#### 1.8 Cleanup

**After all tests pass:**

- Remove `@wterm/dom` from `apps/website/package.json` dependencies
- Remove `@wterm/dom` from `pnpm-workspace.yaml` catalog if no other consumer
- Remove `@wterm/core` if it was an implicit dependency
- Remove `./node_modules/.pnpm/@wterm*` (via `vp install`)

---

### P1: Configure xterm.js for Performance & Smoothness

**Why:** After the swap, tune xterm.js to match kitty/ghostty-level smoothness. The research shows xterm.js WebGL achieves ~0.7-4ms/frame vs 15-19ms for canvas.

#### 1.9 Ligature Support

**Add:** `@xterm/addon-ligatures` v0.10.0 (193KB/58KB gzipped)

**File:** `apps/website/src/terminal/terminal-adapter.ts`
Load during init:

```ts
import { LigaturesAddon } from "@xterm/addon-ligatures";
// In init():
const ligaturesAddon = new LigaturesAddon();
await term.loadAddon(ligaturesAddon);
```

**CSS update:** Remove `font-variant-ligatures: none` from `.xterm` overrides in terminal.css. xterm.js handles ligatures via its font atlas.

**Known issues:** Extremely wide ligature glyphs may need special handling (xterm.js PR #5278). Cursor background can get stuck on ligature cells (fixed in Dec 2025 per #5205). Both are edge cases unlikely to manifest in typical terminal output.

**Validation:** Write a ligature test string (e.g., `→`, `!=`, `=>`) and verify visually that they render as single glyphs.

#### 1.10 Kitty/Sixel Image Protocol Support

**Add:** `@xterm/addon-image` v0.9.0 (60KB/20KB gzipped)

**File:** `apps/website/src/terminal/terminal-adapter.ts`
Load during init:

```ts
import { ImageAddon } from "@xterm/addon-image";
// In init():
const imageAddon = new ImageAddon({
  kittySupport: true,
  kittySizeLimit: 20000000,
});
await term.loadAddon(imageAddon);
```

**Note:** Kitty graphics protocol is MVP-level in v6.0.0 — supports transmit (`a=t`) and transmit+display (`a=T`); placement action (`a=p`) is tracked in xterm.js Issue #5707. Sixel support is mature. Both require the WebGL renderer to function.

**Validation:** Not easily tested without a tmux pane outputting Kitty/Sixel sequences. Consider skipping automated validation; document as a capability.

#### 1.11 Smooth Scrolling

**File:** `apps/website/src/terminal/terminal-adapter.ts`

xterm.js v6 supports smooth scrolling via `smoothScrollDuration` option:

```ts
const term = new Terminal({
  smoothScrollDuration: 0, // Disable JS smooth scrolling; use native scroll
});
```

The project's `scrollTerminalToBottom()` already does instant scroll to bottom (good for output following). xterm.js's own smooth scrolling (CSS transition-based) can interfere with this. Recommend disabling xterm.js smooth scrolling and relying on the browser's native scroll behavior.

#### 1.12 Render Latency Tuning

**File:** `apps/website/src/terminal/terminal-adapter.ts`

```ts
const term = new Terminal({
  // ... other opts
  allowProposedApi: true, // Access _core for fit measurements
  fontSize: 14,
  fontFamily: 'ui-monospace, "SFMono-Regular", ...',
  lineHeight: 1.2,
  scrollback: 5000, // Match WTerm default
  tabStopWidth: 8,
  cursorBlink: true,
  cursorStyle: "block",
});
```

The WebGL renderer is the default with `@xterm/addon-webgl` loaded. No additional configuration needed — it renders to the terminal element's canvas.

**Validation:** `vp run website#dev` — visually verify terminal feels responsive. Check browser DevTools Performance tab for frame times.

---

### P2: Future Considerations

1. **WebGPU renderer:** xterm.js PR #5666 (draft by @Tyriar, Feb 2026). Not yet merged. When available as `@xterm/addon-webgpu`, swap in. xterm.js WebGL2 already provides 5-9x improvement; WebGPU would be incremental.

2. **Ghostty-web migration path:** Track `coder/ghostty-web` v1.0 release and benchmark against xterm.js WebGL. If ghostty-web shows measurable latency/rendering advantages AND has solved COOP/COEP requirements, the adapter layer pattern makes it easy to swap: implement the same `TerminalInstance` interface with ghostty-web's xterm.js-compatible API. No changes needed anywhere else.

3. **Web Worker parser (react-term pattern):** For chasing sub-2ms input latency, consider moving VT parsing off-main-thread. Requires SharedArrayBuffer (COOP/COEP). Not worth the infrastructure cost for v1.

---

## Part 2: UI Chrome — Priority-Ordered Improvements

### P0: Critical Accessibility Fixes

#### 2.1 Fix Tab Key Hijacking in Input Row

**Why:** The `onKeyDown` handler at `main.tsx:928-933` calls `event.preventDefault()` on Tab, sending it to the terminal. This traps keyboard focus — users cannot Tab to the Run button or other controls. This is an **accessibility blocker.**

**File:** `apps/website/src/main.tsx`, input row `onKeyDown` (line ~928)

**Change:**

```tsx
onKeyDown={(event) => {
  if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    // Only intercept bare Tab. Shift+Tab, Ctrl+Tab, etc. pass through for navigation.
    event.preventDefault();
    void sendInputKey("Tab", inputValue);
  }
}}
```

If the user needs to send literal Tab to the terminal AND navigate the UI, we need a UI affordance. Options:

- **Recommended:** Add a small "Tab" icon button next to the input (keyboard-only: `Ctrl+Tab` or `Cmd+Tab` for navigation, bare Tab for terminal). This matches how most web terminals handle it (VS Code terminal, Hyper).
- **Alternative:** Only intercept Tab when the input has content (empty input → Tab navigates, non-empty → Tab sent to terminal). This is intuitive but inconsistent.

**Decision:** Go with modifier approach first (least invasive). If user feedback demands easier Tab sending, add the icon button later.

**Validation:**

- Tab key when input is focused moves focus to Run button
- Shift+Enter, Ctrl+Tab, etc. pass through for browser navigation
- Can still send Tab to terminal (manual test: type in input, press Tab, verify tmux receives it)

#### 2.2 Complete ARIA Tablist Pattern for Window and Pane Strips

**Why:** Both `WindowStrip` and `PaneStrip` (in PaneStrip conditional at line ~952-971) have `role="tablist"` on the container but missing `role="tab"`, `aria-selected`, `aria-controls`, and `tabindex` on the tabs. Screen readers can't identify these as tabs or know which is selected.

**File:** `apps/website/src/main.tsx`

**WindowStrip (line ~1119):**

```tsx
{
  props.windows.map((window) => (
    <Button
      key={window.id}
      role="tab"
      aria-selected={window.id === props.selectedWindow}
      aria-controls="terminal-panel"
      tabIndex={window.id === props.selectedWindow ? 0 : -1}
      id={windowTabId(window.id)}
      className={`window-tab ${window.id === props.selectedWindow ? "selected" : ""}`}
      type="button"
      onPress={() => props.onSelect(window.id)}
    >
      <span>
        {window.index}:{window.name}
      </span>
      <small>{window.panes}</small>
    </Button>
  ));
}
```

Also add `id="terminal-panel"` to the terminal element or wrapper:

```tsx
<div id="terminal-panel" role="tabpanel" aria-labelledby={windowTabId(activeWindowId)}>
  {/* terminal content */}
</div>
```

**PaneStrip (line ~952):**
Same pattern:

```tsx
{
  pane.id === selection.pane ? "selected" : "";
}
// Add: role="tab" aria-selected={pane.id === selection.pane} aria-controls="terminal-panel"
// tabIndex={pane.id === selection.pane ? 0 : -1}
```

**Add keyboard navigation:** Handle ArrowLeft/ArrowRight in the tablist to move between tabs (standard ARIA tablist keyboard pattern).

**Validation:**

- Screen reader announces "tab, selected" for active window/pane tab
- Arrow keys navigate between tabs
- `aria-controls` points to existing terminal panel ID

---

### P1: CSS Tokenization — Eliminate Hardcoded Colors

**Why:** ~25 hardcoded color values across 5 CSS files. Every primary accent change requires finding 15+ manual `rgba(94,106,210,X)` values. Danger color changes require 6+ spots. This is the single biggest engineering debt in the stylesheet.

#### 2.3 Add New CSS Tokens

**File:** `apps/website/src/styles/tokens.css`

Add these tokens after the existing definitions:

```css
:root {
  /* Existing tokens... */

  /* Primary accent derivatives (computed from --primary) */
  --primary-dim-border: rgba(94, 106, 210, 0.58);
  --primary-subtle-border: rgba(94, 106, 210, 0.55);
  --primary-subtle-bg: rgba(94, 106, 210, 0.16);
  --primary-focus-ring: rgba(94, 106, 210, 0.45);
  --primary-focus-border: rgba(130, 143, 255, 0.66);
  --primary-focus-shadow: rgba(94, 106, 210, 0.22);

  /* Danger accent derivatives */
  --danger-hover-border: rgba(255, 107, 107, 0.62);
  --danger-hover-bg: rgba(255, 107, 107, 0.1);
  --danger-dim-border: rgba(255, 107, 107, 0.42);
  --danger-dim-bg: rgba(255, 107, 107, 0.08);
  --danger-panel-border: rgba(255, 107, 107, 0.38);
  --danger-notice-border: rgba(255, 107, 107, 0.4);
  --danger-empty-border: rgba(255, 107, 107, 0.35);
  --danger-text: #ff8a8a;

  /* Status text colors */
  --success-text: #c8f7d2;
  --warning-text: #ffe2a8;
  --danger-text-status: #ffb8b8;

  /* Surface/background derivatives */
  --card-hover-bg: #121318;
  --preview-bg: #050506;
  --preview-text: #d8dee9;
  --danger-surface: #1a1112;
  --topbar-bg: rgba(1, 1, 2, 0.96);
  --modal-backdrop: rgba(1, 1, 2, 0.62);
  --terminal-overlay: rgba(15, 16, 17, 0.85);

  /* Misc */
  --white: #fff;
}
```

#### 2.4 Replace Hardcoded Values Across All CSS Files

**File:** `apps/website/src/styles/layout.css`
| Line | Old | New |
|------|-----|-----|
| 36 | `background: rgba(1, 1, 2, 0.96)` | `background: var(--topbar-bg)` |
| 84 | `background: #121318` | `background: var(--card-hover-bg)` |
| 84 | `border-color: rgba(94, 106, 210, 0.58)` | `border-color: var(--primary-dim-border)` |
| 146 | `color: #d8dee9` | `color: var(--preview-text)` |
| 145 | `background: #050506` | `background: var(--preview-bg)` |
| 190 | `background: #1a1112` | `background: var(--danger-surface)` |
| 189 | `border-color: rgba(255, 107, 107, 0.4)` | `border-color: var(--danger-notice-border)` |
| 35 | `outline: 1px solid rgba(94, 106, 210, 0.45)` | `outline: 1px solid var(--primary-focus-ring)` |

**File:** `apps/website/src/styles/components.css`
| Line | Old | New |
|------|-----|-----|
| 49 | `border-color: rgba(255, 107, 107, 0.62)` | `border-color: var(--danger-hover-border)` |
| 50 | `background: rgba(255, 107, 107, 0.1)` | `background: var(--danger-hover-bg)` |
| 52 | `color: #ff8a8a` | `color: var(--danger-text)` |
| 54 | `border: 1px solid rgba(255, 107, 107, 0.42)` | `border: 1px solid var(--danger-dim-border)` |
| 55 | `background: rgba(255, 107, 107, 0.08)` | `background: var(--danger-dim-bg)` |
| 29 | `border-color: rgba(255, 107, 107, 0.38)` | `border-color: var(--danger-panel-border)` |
| 66 | `border-color: rgba(94, 106, 210, 0.55)` | `border-color: var(--primary-subtle-border)` |
| 67 | `background: rgba(94, 106, 210, 0.16)` | `background: var(--primary-subtle-bg)` |
| 86 | `border-color: rgba(94, 106, 210, 0.55)` | `border-color: var(--primary-subtle-border)` |
| 87 | `background: rgba(94, 106, 210, 0.16)` | `background: var(--primary-subtle-bg)` |
| 118 | `border-color: rgba(130, 143, 255, 0.66)` | `border-color: var(--primary-focus-border)` |
| 120 | `box-shadow: 0 0 0 2px rgba(94, 106, 210, 0.22)` | `box-shadow: 0 0 0 2px var(--primary-focus-shadow)` |

**File:** `apps/website/src/styles/terminal.css`
| Line | Old | New |
|------|-----|-----|
| 28 | `background: rgba(15, 16, 17, 0.85)` | `background: var(--terminal-overlay)` |
| 39 (wterm focus outline) | `rgba(94, 106, 210, 0.45)` | `var(--primary-focus-ring)` |

**Also update status chip colors** in components.css:

```css
.status.success {
  color: var(--success-text);
}
.status.warning {
  color: var(--warning-text);
}
.status.danger {
  color: var(--danger-text-status);
}
```

And `.primary` button text uses `#fff` → `var(--white)`.

**Validation:**

- `vp check` passes (no lint errors from CSS)
- No visual regressions — spot-check Fleet cards, Cockpit toolbar, modals, window tabs, pane tabs
- Every `rgba(94,106,210,*)` instance replaced by a CSS variable
- Every `rgba(255,107,107,*)` instance replaced by a CSS variable

---

### P2: Visual Polish

#### 2.5 Session Cards: Differentiate Hover vs Selected

**Why:** Currently hover and selected states are visually identical (`border-color: rgba(94,106,210,0.58)`, `background: #121318`). User can't tell which card was last opened vs which the cursor is over.

**File:** `apps/website/src/styles/layout.css`

**Design decision:** Selected state gets a stronger lavender accent with a left border accent bar; hover keeps the subtle border tint and lift.

```css
/* Selected: stronger lavender left accent + background lift */
.session-card.selected {
  border-color: var(--primary-subtle-border);
  background: var(--surface-2);
  box-shadow: inset 3px 0 0 var(--primary);
}

/* Hover: subtle tint + lift */
.session-card:hover {
  border-color: var(--primary-dim-border);
  background: var(--card-hover-bg);
  transform: translateY(-1px);
}

/* Combined: when hovering the already-selected card, keep selected look */
.session-card.selected:hover {
  border-color: var(--primary-subtle-border);
  background: var(--surface-2);
  box-shadow: inset 3px 0 0 var(--primary);
  transform: none; /* Don't lift already-selected cards */
}
```

**Alternative considered:** Using a lavender left-border vs no border. The 3px inset `box-shadow` approach is chosen because it works without changing the card's box model (border-box) and doesn't affect layout.

**Validation:** Open a session → card shows left lavender bar. Hover another card → tint + lift but no bar. Click a new session → bar moves to new card. Visual distinction is clear.

#### 2.6 Modal Enter/Exit Transitions

**Why:** Modals appear/disappear instantly. Feels jarring.

**File:** `apps/website/src/styles/components.css`

```css
.floating-panel {
  /* Add transition properties: */
  animation: panel-enter 200ms ease-out;
}

@keyframes panel-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.panel-card {
  /* Add card-level animation: */
  animation: panel-card-enter 200ms ease-out;
}

@keyframes panel-card-enter {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

**Note:** Exit animations require coordinating with React's unmount. Simplest approach: only animate enter. If desired, add state management (visible + animating) for exit. Start with enter-only to keep complexity low.

**`prefers-reduced-motion` guard:** The existing `@media (prefers-reduced-motion: reduce)` block already disables animations. The keyframes won't conflict — but confirm the existing `animation-duration: 1ms !important` rule covers these.

**Validation:** Open Token panel — fades in smoothly. Open Confirm Kill — fades in. No jank. With reduced motion preference, appears instantly.

#### 2.7 Window Strip Scroll Overflow Indicators

**Why:** Long window lists scroll horizontally with no visual indication of hidden content.

**File:** `apps/website/src/styles/components.css`

```css
.window-strip {
  /* Existing styles... */

  /* Add scroll-driven fade indicators */
  /* Left fade: visible when scrolled right */
  background:
    linear-gradient(to right, var(--surface-1) 30%, transparent) left / 30px 100% no-repeat,
    /* Right fade: always visible */ linear-gradient(to left, var(--surface-1) 30%, transparent)
      right / 30px 100% no-repeat;
  background-attachment: local, scroll;
}
```

Wait — `background-attachment: local, scroll` with gradients requires the gradient to be on top of content. A simpler CSS-only approach would use `mask-image`, but browser support varies. For MVP, add the right-edge fade only (always visible) as background overlay. The left fade requires JavaScript scroll detection.

**Simpler approach:** Add `mask-image` if Chromium-only is acceptable, or use a pseudo-element with gradient at the right edge:

```css
.window-strip {
  position: relative; /* needed for pseudo-element */
}
.window-strip::after {
  content: "";
  position: sticky;
  right: 0;
  width: 30px;
  height: 100%;
  background: linear-gradient(to right, transparent, var(--surface-1));
  pointer-events: none;
}
```

**Validation:** With 6+ windows, right edge shows gradient fade. Hovering near-right-edge tabs works (pointer-events: none on pseudo-element).

#### 2.8 Refresh Button Icon

**Why:** Shows letter "R" — poor affordance.

**File:** `apps/website/src/main.tsx`, topbar refresh button

HeroUI may not provide a refresh icon. Use an inline SVG:

```tsx
<Button
  className="icon-button"
  type="button"
  aria-label="Refresh sessions"
  onPress={() => {
    setOperation("refresh");
    void refreshSessions();
  }}
  isDisabled={operation === "refresh"}
>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M13.65 2.35A7.96 7.96 0 008 0a8 8 0 100 16 7.96 7.96 0 005.657-2.343 1 1 0 10-1.414-1.414A6 6 0 118 2a5.99 5.99 0 014.243 1.757L10.5 5.5H16V0l-2.35 2.35z"
      fill="currentColor"
    />
  </svg>
</Button>
```

**Validation:** Icon visible in topbar. Clicks trigger refresh. Disabled during refresh operation.

#### 2.9 Input Row: Remove "Enter" Button

**Why:** Redundant — form already sends Enter on submit. Two-buttons-for-one-action is confusing.

**File:** `apps/website/src/main.tsx`, input row (line ~938)

Remove the Enter button:

```tsx
{
  /* Remove: */
}
<Button className="ghost" type="button" onPress={() => void sendKeys(["Enter"])}>
  Enter
</Button>;
```

**Validation:** Pressing Enter in input submits form and sends input+Enter to tmux. Only "Run" button remains.

#### 2.10 Terminal Toolbar: Add Visual Separator

**Why:** No visual separation between info section (pane title, dimensions) and actions (Split H, Split V, Kill Window).

**File:** `apps/website/src/styles/terminal.css`

```css
.terminal-toolbar {
  /* Existing flex layout... */

  /* Add a gap separator between info and actions */
  &::before {
    content: "";
    order: 1;
    flex: 1;
  }
}

.terminal-toolbar > div:first-child {
  /* Info section — keep at start */
  order: 0;
}

.terminal-actions {
  /* Actions section — push to end */
  order: 2;
}
```

Wait, the existing layout uses `justify-content: space-between`. A visual separator (1px vertical hairline) between the info `<div>` and `.terminal-actions` can be achieved with:

```css
.terminal-actions {
  border-left: 1px solid var(--hairline);
  padding-left: 16px;
}
```

**Validation:** Vertical hairline visible between pane info and action buttons.

#### 2.11 Pane Strip: Show Pane Index

**Why:** Pane tabs show title/command only — identical looking panes (both "bash") are indistinguishable.

**File:** `apps/website/src/main.tsx`, pane strip (line ~960)

```tsx
{pane.index}:{pane.title || pane.currentCommand || pane.id}
```

**Note:** Need to verify `pane.index` exists in the `TmuxPane` type. Check `packages/utils/src/index.ts`.

**Validation:** Pane tabs show `0:bash`, `1:htop` instead of just `bash`, `htop`.

#### 2.12 Confirm Kill Window: State Consequences

**Why:** Doesn't mention irreversibility or affected panes.

**File:** `apps/website/src/main.tsx`, ConfirmWindowKill (line ~1235)

```tsx
<p>
  This action cannot be undone. Window {props.window.index}:{props.window.name}
  {props.window.panes > 0
    ? ` and its ${props.window.panes} pane${props.window.panes > 1 ? "s" : ""}`
    : ""}{" "}
  will be permanently closed.
</p>
```

**Validation:** Confirm dialog states "This action cannot be undone" and pane count.

---

## Part 3: Risk Assessment & Rollback Strategy

### Risk Matrix

| Risk                                                             | Likelihood | Impact                       | Mitigation                                                                                                                                        |
| ---------------------------------------------------------------- | ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| xterm.js WebGL addon fails to init on some GPUs                  | Medium     | High — terminal unreadable   | Adapter auto-falls back to Canvas2D renderer. Log WebGL failure without crashing.                                                                 |
| xterm.js DOM structure incompatible with fit measurement         | Medium     | Medium — resize broken       | Use `_core._renderService.dimensions` as primary; probe DOM as fallback. Unit test both paths.                                                    |
| CSS class name conflicts between @wterm/dom and @xterm/xterm CSS | Low        | Medium — visual glitches     | Remove `@wterm/dom` CSS import entirely. Only import `@xterm/xterm/css/xterm.css`.                                                                |
| E2E tests break due to Canvas rendering (no DOM text)            | High       | Medium — test suite fails    | Rewrite text content assertions to use `page.evaluate()` + buffer API. Consider screenshot testing as fallback.                                   |
| Tokenization breaks hover/selected states                        | Low        | Low — visual regression      | Spot-check all 7 component areas after tokenization. E2E visual test if available.                                                                |
| Tab key behavior change breaks terminal Tab input                | Low        | Medium — user can't send Tab | Test explicitly: type text in input, press Tab, verify tmux receives Tab character.                                                               |
| Bundle size increase from xterm.js                               | Low        | Low — acceptable             | 193KB gzipped for xterm.js + addons vs current 185KB for ghostty-web (hypothetical). @wterm/dom was smaller but DOM-based. Trade-off is worth it. |

### Rollback Strategy

The terminal swap is the highest-risk change. Mitigate with:

1. **Feature flag or git branch:** Do the swap on a dedicated branch. Merge only after all tests pass and manual smoke tests confirm terminal works.
2. **Keep @wterm/dom in package.json during transition:** Install xterm.js alongside @wterm/dom. Switch the adapter in main.tsx via a single import change. If rollback needed, revert one line.
3. **Phase the swap:**
   - Phase 1: Install xterm.js + create adapter (no main.tsx changes) — no user impact
   - Phase 2: Switch main.tsx import — terminal now uses xterm.js
   - Phase 3: Remove @wterm/dom after validation
4. **Manual smoke test checklist:**
   - Fleet overview renders session cards with previews
   - Open session → terminal renders ANSI capture
   - Text input via input row → appears in terminal
   - WebSocket stream output → renders in terminal
   - Window resize → terminal resizes correctly
   - Window tabs → switch between windows
   - Pane tabs → switch between panes (multi-pane)
   - Scroll up → auto-follow pauses
   - Scroll to bottom → auto-follow resumes
   - Kill window → terminal reinitializes
   - Keyboard input (Enter, Tab, arrows) → forwarded to tmux
   - Ligatures render (if addon loaded)
   - 980px and 560px breakpoints → layout correct

5. **For chrome changes:** Each CSS change is independently revertible. If a tokenization causes a visual regression, revert the individual substitution. No architectural coupling between chrome changes.

---

## Part 4: Files Changed Summary

### Terminal Rendering Track

| File                                            | Change Type | Description                                                                                                               |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/package.json`                     | Edit        | Add @xterm/xterm, @xterm/addon-webgl, @xterm/addon-ligatures (optional), @xterm/addon-image (optional); remove @wterm/dom |
| `pnpm-workspace.yaml`                           | Edit        | Update catalog entries                                                                                                    |
| `apps/website/src/terminal/terminal-adapter.ts` | **New**     | TerminalInstance wrapper around xterm.js Terminal                                                                         |
| `apps/website/src/main.tsx`                     | Edit        | Import adapter instead of WTerm; update ref types; update resetTerminalSnapshot                                           |
| `apps/website/src/terminal/terminal-fit.ts`     | Edit        | Update measureTerminalCell for xterm.js DOM structure; remove height="" hack                                              |
| `apps/website/src/terminal/terminal-scroll.ts`  | Edit        | Target xterm-viewport for scroll operations                                                                               |
| `apps/website/src/styles/terminal.css`          | Edit        | Replace .wterm overrides with .xterm overrides; remove @wterm/dom-specific rules                                          |
| `apps/website/tests/e2e/terminal.spec.ts`       | Edit        | Update selectors; rewrite text content assertions for Canvas rendering                                                    |

### UI Chrome Track

| File                                     | Change Type | Description                                                                                                  |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/website/src/styles/tokens.css`     | Edit        | Add ~25 new CSS tokens for primary/danger/surface derivatives                                                |
| `apps/website/src/styles/layout.css`     | Edit        | Replace hardcoded colors with tokens; card selected state                                                    |
| `apps/website/src/styles/components.css` | Edit        | Replace hardcoded colors; modal animations; scroll overflow                                                  |
| `apps/website/src/styles/terminal.css`   | Edit        | Replace hardcoded colors; toolbar separator; xterm overrides                                                 |
| `apps/website/src/main.tsx`              | Edit        | ARIA tablist on windows/panes; Tab key fix; remove Enter button; refresh icon; pane index; kill confirm text |

---

## Part 5: Validation Checklist (Pre-Merge Gate)

### Automated

- [ ] `vp install` succeeds (all packages install)
- [ ] `vp check` passes (format, lint, type-check)
- [ ] `vp run -r test` passes (all unit tests)
- [ ] `vp run website#e2e` passes (all 16 Playwright tests — after test updates)

### Terminal Rendering Manual

- [ ] ANSI capture renders correctly (HTTP fallback)
- [ ] WebSocket stream renders correctly
- [ ] resize works on window resize and pane switch
- [ ] cursor blinks, focus outline visible
- [ ] scrollback works, auto-follow toggles correctly
- [ ] keyboard input forwarded (Enter, Tab, text)
- [ ] kill window → terminal resets and new window renders
- [ ] multi-pane switching works
- [ ] ligatures render (if addon loaded)
- [ ] at 980px and 560px breakpoints, terminal fills available space

### UI Chrome Manual

- [ ] Session cards: hover vs selected visually distinct
- [ ] Session cards: no hardcoded colors remain
- [ ] Window tabs: ARIA tablist works with screen reader
- [ ] Pane tabs: ARIA tablist works, shows index
- [ ] Input row: Tab navigates to Run button
- [ ] Input row: no Enter button
- [ ] Modals: fade-in animation plays
- [ ] Modals: reduced motion respects preference
- [ ] Window strip: right-edge fade visible with many tabs
- [ ] Refresh button: SVG icon visible
- [ ] Confirm kill: states "cannot be undone" and pane count
- [ ] Topbar: no hardcoded background
- [ ] Toolbar: visual separator between info and actions
- [ ] All CSS files: no raw rgba(94,106,210,\*) values remain
- [ ] All CSS files: no raw rgba(255,107,107,\*) values remain

---

## Part 6: Implementation-Ready Meta-Prompt

Below is the compact contract for the worker agent.

---

## META-PROMPT

### Goal

Swap the terminal rendering backend from `@wterm/dom` (DOM-grid renderer) to `@xterm/xterm` v6 with the WebGL2 addon, then tokenize all hardcoded CSS colors and fix two critical accessibility issues. The terminal must feel GPU-smooth, and the chrome must use only CSS custom properties from `tokens.css`.

### Context/Evidence

**Terminal library research conclusion:** xterm.js v6 + `@xterm/addon-webgl` is the only production-ready GPU terminal for the web (20.5K ★, used by VS Code). WebGL2 rendering is 5-9x faster than DOM-grid. Ligature addon available. Kitty/Sixel image addon available. ghostty-web is pre-1.0, lacks benchmarks, requires COOP/COEP — not ready.

**Current state:** `@wterm/dom` v0.3.0 creates a DOM grid of `<div class="term-row"><span>W</span></div>` — hundreds of DOM nodes per frame. No GPU acceleration. No ligature support. No image protocol support.

**Codebase integration points (main.tsx):**

- `new WTerm(el, opts)` at `ensureTerminal()` line ~136
- `term.write(data)` at renderTerminal, connectTerminalStream
- `term.resize(cols, rows)` at fitTerminalToContainer
- `term.cols`, `term.rows`, `term.element` read in multiple places
- `term.bridge?.init()` at resetTerminalSnapshot (line ~1491)
- `term.onData`, `term.onResize` callbacks
- Scroll system targets `element.scrollTop` directly (terminal-scroll.ts)
- Fit system probes `.term-row` DOM structure (terminal-fit.ts)
- CSS targets `.wterm`, `.term-grid`, `.term-row`, `.term-cursor`

**xterm.js equivalents:**

- Constructor: `new Terminal(opts)` + `term.open(el)`
- Write/resize/cols/rows/element/onData/onResize: same API
- Reset: `term.reset()` instead of `term.bridge?.init()`
- WebGL: `term.loadAddon(new WebglAddon())`
- Viewport: `.xterm-viewport` element (for scroll)
- Cell metrics: `_core._renderService.dimensions` (private API, but reliable)

**CSS tokenization debt:** ~25 hardcoded color values across 5 CSS files. 15+ instances of `rgba(94,106,210,X)` that should be `--primary-*` tokens. Danger colors similarly duplicated.

**Accessibility bugs:**

1. Tab key hijacking: `onKeyDown` at main.tsx line ~928 calls `event.preventDefault()` on all Tab presses, trapping keyboard focus
2. WindowStrip and PaneStrip missing `role="tab"`, `aria-selected`, `aria-controls`, `tabindex`

### Hard Constraints

1. **No edits to `src/terminal/*` files unless the task explicitly touches Terminal** — this task explicitly touches Terminal, so terminal-fit.ts and terminal-scroll.ts are in scope for the xterm.js swap.
2. **Use CSS tokens from `styles/tokens.css`** — no new one-off hex/rgba colors in component CSS. Add semantic tokens to `tokens.css` when needed.
3. **Design system posture:** black cockpit, lavender accent only, no gradients/glassmorphism/emoji/rainbow.
4. **All existing tests must pass** after modifications. Update e2e tests for xterm.js DOM differences.
5. **Terminal API compatibility:** The adapter must expose the same interface shape (`write`, `resize`, `cols`, `rows`, `element`, `init`, `reset`) so main.tsx doesn't need changes beyond the import and reset.
6. **Scroll behavior must be preserved:** auto-follow toggle, scroll-to-bottom on write, user-scroll detection.
7. **Both breakpoints (980px, 560px) must still work.**
8. **`prefers-reduced-motion` must still be respected.**
9. **Do NOT remove @wterm/dom from package.json until all validation passes.** Keep it installable during transition.

### Suggested Approach

#### Phase 1: Install & Adapter (lowest risk, no runtime changes)

1. Add `@xterm/xterm` and `@xterm/addon-webgl` to `apps/website/package.json` and `pnpm-workspace.yaml`
2. Run `vp install`
3. Create `apps/website/src/terminal/terminal-adapter.ts`:
   - Export `TerminalInstance` interface (matching current WTerm API surface)
   - Export `createTerminal(element, opts)` function
   - Inside: create `new Terminal(opts)`, load `WebglAddon` (with try/catch fallback to canvas), call `term.open(element)`
   - `init()`: returns `Promise<void>` after addon loaded
   - `reset()`: calls `term.reset()`
   - `cols`, `rows`, `element`: pass through from Terminal
   - `write()`, `resize()`: pass through
4. Add `@xterm/addon-ligatures` and `@xterm/addon-image` (optional, can defer to Phase 2)

#### Phase 2: Swap in main.tsx (structural change)

5. In main.tsx:
   - Replace `import { WTerm } from "@wterm/dom"` with `import { createTerminal, type TerminalInstance } from "./terminal/terminal-adapter"`
   - Replace `import "@wterm/dom/css"` with `import "@xterm/xterm/css/xterm.css"`
   - Change `terminal.current` type from `WTerm` to `TerminalInstance`
   - In `ensureTerminal()`: replace `new WTerm(...)` with `createTerminal(element, {...})`
   - In `resetTerminalSnapshot()`: replace `term.bridge?.init(cols, rows)` with `term.reset()`
   - Remove `term.element.style.height = ""` line in `fitTerminalToContainer` (xterm.js doesn't set inline height)

#### Phase 3: Update support files

6. Update `terminal-fit.ts`:
   - `measureTerminalCell()`: change probe class from `term-row` to `xterm-rows`
7. Update `terminal-scroll.ts`:
   - Add `getViewport()` helper targeting `.xterm-viewport`
   - Update `scrollTerminalToBottom`, `isScrolledToBottom`, `isScrolledNearTop` to use viewport
8. Update `terminal.css`:
   - Replace `.wterm` selectors with `.xterm` equivalents
   - `.term-grid` → `.xterm-screen`
   - `.term-row` → `.xterm-rows > div`
   - `.term-cursor` → `.xterm-cursor`
   - `.wterm.focused` → `.xterm.focus`
   - `.wterm.has-scrollback` → `.xterm .xterm-viewport`
   - Keep terminal container styles (`.terminal`, `.terminal-wrap`)

#### Phase 4: Update E2E Tests

9. Audit `terminal.spec.ts`:
   - Replace `.term-row` and `.term-cursor` selectors
   - Rewrite text content assertions: xterm.js renders to canvas in WebGL mode, so `page.locator().toContainText()` won't work for terminal text. Use `page.evaluate(() => { const term = ...; return term.buffer.active.getLine(0).translateToString(); })` or screenshot comparisons.

#### Phase 5: CSS Tokenization

10. Add new tokens to `tokens.css`:
    - `--primary-dim-border`, `--primary-subtle-border`, `--primary-subtle-bg`, `--primary-focus-ring`, `--primary-focus-border`, `--primary-focus-shadow`
    - `--danger-hover-border`, `--danger-hover-bg`, `--danger-dim-border`, `--danger-dim-bg`, `--danger-panel-border`, `--danger-notice-border`, `--danger-empty-border`, `--danger-text`
    - `--success-text`, `--warning-text`, `--danger-text-status`
    - `--card-hover-bg`, `--preview-bg`, `--preview-text`, `--danger-surface`, `--topbar-bg`, `--modal-backdrop`, `--terminal-overlay`, `--white`
11. Replace all hardcoded values in `layout.css`, `components.css`, `terminal.css` with the new tokens. Every `rgba(94,106,210,...)` and `rgba(255,107,107,...)` must be replaced. Every `#121318`, `#050506`, `#d8dee9`, `#1a1112`, `#ff8a8a`, `#fff` must use a token.

#### Phase 6: Accessibility Fixes

12. Fix Tab hijacking: change `onKeyDown` to only preventDefault when Tab is pressed without modifiers (`!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey`).
13. Complete ARIA tablist: add `role="tab"`, `aria-selected`, `aria-controls="terminal-panel"`, `tabIndex` to WindowStrip and PaneStrip buttons. Add `id="terminal-panel"` and `role="tabpanel"` to the terminal wrapper.

#### Phase 7: Visual Polish (lower priority, can defer)

14. Differentiate card hover vs selected: add `box-shadow: inset 3px 0 0 var(--primary)` to `.session-card.selected`
15. Modal enter animation: add `@keyframes panel-enter` and `@keyframes panel-card-enter`
16. Window strip overflow fade: add `::after` pseudo-element with gradient
17. Refresh icon: replace "R" text with SVG icon
18. Remove "Enter" button from input row
19. Terminal toolbar separator: add `border-left: 1px solid var(--hairline); padding-left: 16px` to `.terminal-actions`
20. Pane strip: prepend `{pane.index}:` to tab label
21. Confirm kill: add "This action cannot be undone" and pane count to message

#### Phase 8: Cleanup & Validation

22. Run `vp install && vp check && vp run -r test && vp run website#e2e`
23. Manual smoke test against the checklist in Part 5
24. Once all tests pass, remove `@wterm/dom` from `package.json` and catalog, run `vp install`

### Validation

After each phase, run:

```bash
# Phase 1-3:
vp check                              # Types/lint must pass
# Phase 4:
vp run website#e2e                    # All Playwright tests pass
# Phase 5-7:
vp check                              # No lint errors from CSS variables
# Phase 8:
vp run -r test && vp run website#e2e  # Full suite green
```

Manual smoke test items (from Part 5 checklist):

- Terminal renders ANSI capture
- WebSocket stream works
- Resize on window resize and pane switch
- Scrollback and auto-follow
- Keyboard input (Enter, Tab, text)
- Kill window → terminal reinitializes
- Multi-pane switching
- Ligatures (if addon loaded)
- Both breakpoints correct
- Cards: hover vs selected distinct
- ARIA tabs work in screen reader
- Tab navigates in input row
- Modals animate in
- No hardcoded colors remain

### Stop/Escalation Rules

- **If `vp check` fails after Phase 2 swap:** Revert the main.tsx import change and debug the adapter. Check that `TerminalInstance` interface matches all usage sites.
- **If e2e tests cannot be made to pass with xterm.js Canvas rendering:** Escalate — consider whether to accept screenshot-based testing or keep one DOM-text test path. Do NOT ship with failing e2e tests.
- **If a CSS token value doesn't exist:** Add it to `tokens.css` — do NOT use a hardcoded fallback.
- **If xterm.js WebGL fails to init in the test environment (headless):** That's expected. The adapter should already have a Canvas2D fallback path. Verify tests pass with canvas renderer.
- **If any manual smoke test fails:** Do not proceed to the next phase. Debug the failing item before continuing.

### Resolved Questions & Assumptions

1. **Q: Should we use ghostty-web instead?** A: No. It's pre-1.0, lacks benchmarks, requires COOP/COEP, and npm v0.4.0 may not include the WebGPU renderer. Track for v1.0+ migration.

2. **Q: Does the adapter need to mirror WTerm's entire API?** A: No. Only the surface used by main.tsx: `write`, `resize`, `cols`, `rows`, `element`, `init`, `reset`/`bridge.init`. Internal WTerm APIs (bridge events, title, response) are not used.

3. **Q: Should we keep @wterm/dom CSS import during transition?** A: No. Remove it when adding xterm.css. The class names conflict (`.terminal` exists in both). Import only xterm.css.

4. **Q: Ligature and image addons — include now or defer?** A: Include ligature addon now (it's ~58KB gzipped and provides a visible quality improvement). Image addon can be deferred — Kitty/Sixel protocols are unlikely to be triggered by typical tmux pane output.

5. **Q: What font ligature settings should xterm.js use?** A: xterm.js + `LigaturesAddon` handles ligature detection automatically via fontkit. The project CSS currently has `font-variant-ligatures: none` on `.wterm` which should be removed for the xterm.js `.xterm` override.

6. **Q: Does the `measureTerminalCell` probe approach still work with xterm.js canvas rendering?** A: With WebGL, xterm.js renders to a canvas — the DOM has NO `.xterm-rows` elements. The probe needs to use the private `_core._renderService.dimensions` API instead, OR we force a brief canvas2d fallback measurement. For fit purposes, using the dimensions API is more reliable and doesn't require DOM probing.

7. **Q: Should we update the terminal toolbar/input row/pane strip in the chrome track?** A: Yes — those are product chrome, not terminal rendering. The terminal CSS boundary rule states: "AI must not edit `src/terminal/*` or `.wterm` CSS unless the task explicitly touches Terminal." Since this task explicitly touches Terminal, the boundary does not apply. The terminal-swap CSS changes go in `terminal.css` alongside chrome changes.
