# Terminal Rendering Pipeline — Full Codebase Context

> Generated 2026-05-15. Covers the complete rendering data flow, integration points, and what would need to change to swap the terminal rendering backend.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  main.tsx (App component)                                │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ API Client │  │ Terminal Proto   │  │ Scroll Sys   │ │
│  │ client.ts  │  │ terminal-protocol│  │ term-scroll  │ │
│  └─────┬──────┘  └────────┬─────────┘  └──────┬───────┘ │
│        │                  │                    │         │
│  ┌─────▼──────────────────▼────────────────────▼───────┐ │
│  │              WTerm instance                          │ │
│  │  @wterm/dom (v0.3.0)  →  @wterm/core (WasmBridge)   │ │
│  │  Renderer (DOM grid of .term-row > spans)           │ │
│  └──────────────────────────┬──────────────────────────┘ │
│                             │                            │
│  ┌──────────────┐  ┌───────▼────────┐                   │
│  │ terminal-fit │  │   CSS Layer    │                   │
│  │ measure/fit  │  │ terminal.css + │                   │
│  └──────────────┘  │ @wterm/dom css │                   │
│                    └────────────────┘                   │
└──────────────────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   API Server    │
                    │ server.ts       │
                    │ tmux-stream.ts  │
                    │   (Node.js)     │
                    └────────────────┘
```

---

## 2. @wterm/dom Usage (main.tsx)

### 2.1 Import & Instantiation

**File:** `apps/website/src/main.tsx`

```ts
// lines 1-2
import "@wterm/dom/css";
import { WTerm } from "@wterm/dom";
```

The `WTerm` constructor is called in `ensureTerminal()` (line ~136):

```ts
terminal.current = new WTerm(element, {
  autoResize: false, // project manages resize manually
  cols: columns || 120,
  cursorBlink: true,
  rows: rows || 34,
  onData: (data) => terminalDataHandler.current(data),
  onResize: scheduleResizeActivePane,
});
terminalReady.current = terminal.current.init();
```

### 2.2 WTerm API surface used

All calls to the WTerm instance:

| Call site                  | Method                           | Purpose                                                        |
| -------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `ensureTerminal()`         | `new WTerm(el, opts)`            | Create terminal                                                |
| `ensureTerminal()`         | `term.init()`                    | Async init (loads WASM, sets up renderer/input)                |
| `ensureTerminal()`         | `term.cols`, `term.rows`         | Read current grid dimensions                                   |
| `ensureTerminal()`         | `term.element`                   | Access DOM element for scroll/fit                              |
| `renderTerminal()`         | `term.write(normalizeAnsi(...))` | Push ANSI output to terminal                                   |
| `connectTerminalStream()`  | `term.write(payload.data)`       | Stream output data                                             |
| `fitTerminalToContainer()` | `term.resize(cols, rows)`        | Resize terminal grid                                           |
| `resetTerminalSnapshot()`  | `term.bridge?.init(cols, rows)`  | **Direct bridge call** — reinitializes the core emulator state |
| `fitTerminalToContainer()` | `term.element.style.height = ""` | Clears `_lockHeight()` inline height                           |

### 2.3 WTerm render DOM structure (from @wterm/dom v0.3.0)

The DOM tree produced by `WTerm` + `Renderer`:

```
div#terminal.wterm.cursor-blink.has-scrollback   ← element
  div.term-grid                                   ← _container
    div.term-row.term-scrollback-row              ← scrollback rows (appended above grid)
      <span>...</span>                            ← runs of styled text
      <span class="term-block term-cursor">       ← block-drawing characters
    div.term-row                                  ← visible grid rows
      <span style="color:...;background:...">...</span>
```

Key CSS classes from `@wterm/dom/src/terminal.css` (overridden partially in project's `terminal.css`):

- `.wterm` — container, font, colors
- `.term-grid` — `display:block; white-space:pre; contain:layout paint style`
- `.term-row` — `height: var(--term-row-height); display:block`
- `.term-row > span` — `display:inline-block; height: var(--term-row-height)`
- `.term-block` — `width:1ch` for block characters
- `.term-cursor` — cursor highlighting
- `.wterm.has-scrollback` — `overflow-y:auto`
- `.wterm.focused .term-cursor` — solid cursor when focused

### 2.4 @wterm/core bridge (TerminalCore interface)

**File:** `node_modules/.pnpm/@wterm+core@0.3.0/node_modules/@wterm/core/dist/terminal-core.d.ts`

The `TerminalCore` interface is the abstraction boundary:

```ts
interface TerminalCore {
  init(cols, rows): void;
  resize(cols, rows): void;
  writeString(str: string): void;
  writeRaw(data: Uint8Array): void;
  getCell(row, col): CellData;
  isDirtyRow(row): boolean;
  clearDirty(): void;
  getCols(): number;
  getRows(): number;
  getCursor(): CursorState;
  // + title, response, scrollback, unhandled sequences...
}
```

`WasmBridge` implements this using a Zig-compiled WASM module. The `WTerm` constructor accepts `core?: TerminalCore` option (line ~89 of wterm.js), allowing an alternative backend to be injected — **this is the swap point for any rendering backend change.**

---

## 3. Terminal Protocol

### 3.1 WebSocket Streaming

**File:** `apps/website/src/terminal/terminal-protocol.ts`

**Message types (server → client):**

```ts
type TerminalStreamMessage =
  | { type: "output"; data: string } // ANSI output chunk
  | { type: "error"; message: string }; // stream error
```

**Command types (client → server):**

```ts
type TerminalStreamCommand =
  | { type: "input"; data: string } // raw keystroke data
  | { type: "resize"; columns: number; rows: number };
```

**Helper functions used by main.tsx:**

- `parseTerminalStreamMessage(value)` — `JSON.parse` with type guard
- `isTerminalStreamOpen(socket)` — checks `socket.readyState === WebSocket.OPEN`
- `sendTerminalResize(socket, cols, rows)` — sends `{type:"resize", ...}`
- `sendTerminalCommand(socket, cmd)` — `socket.send(JSON.stringify(cmd))`
- `normalizeAnsi(ansi)` — adds `\r` before bare `\n` (character-by-character loop)

### 3.2 HTTP Capture

HTTP capture returns `CaptureResult`:

```ts
type CaptureResult = {
  target: string; // pane ID
  ansi: string; // ANSI-encoded terminal contents
  lines: number; // capture length
  terminal: {
    rows: number;
    columns: number;
    cursorRow: number;
    cursorColumn: number;
  };
};
```

Used by:

- `refreshActivePane()` — `GET /api/panes/{id}/capture?lines=240`
- Session previews — `GET /api/panes/{id}/capture?lines=8`
- Fallback when WebSocket stream doesn't deliver in 3s

### 3.3 HTTP Key/Input

- `POST /api/panes/{id}/keys` body: `{keys: string[]}` — named keys like Enter, Tab, ArrowUp
- `POST /api/panes/{id}/input` body: `{data: string}` — raw text input
- `POST /api/panes/{id}/resize` body: `{width, height}` — pane resize

### 3.4 API Server Streaming (Node.js)

**File:** `apps/api/src/tmux-stream.ts`

The server:

1. Spawns `tmux -C attach-session -t {target}` in control mode
2. Sends initial capture via `tmux capture-pane -e -p -S -240 -t {target}`
3. Parses `%output ...` control lines from tmux stdout
4. Decodes octal/escape sequences in tmux control output
5. Resize command: `refresh-client -C {cols}x{rows}`
6. On WebSocket `{type:"resize"}` message, also calls `tmux resize-window -x {cols} -y {rows}`

**File:** `apps/api/src/server.ts` (lines ~148-220)

- WebSocket upgrade on `/api/panes/{target}/stream`
- Auth via token query param or header
- `attachPaneStream()` wires the tmux stream to the WebSocket

---

## 4. Fit/Resize System

### 4.1 Measurement

**File:** `apps/website/src/terminal/terminal-fit.ts`

```ts
type TerminalCellMetrics = { cellWidth: number; rowHeight: number };
```

**`measureTerminalCell(element)`** — Creates a probe `<div class="term-row"><span>W</span></div>`, measures `getBoundingClientRect()`. This relies on `.term-row` and `.term-row > span` CSS classes from @wterm/dom.

**`measureTerminalFit(element, metricsRef)`** — Measures the **parent container** (`.terminal-wrap`) padding-adjusted dimensions, divides by cell metrics, clamps to `[20..500] × [5..200]`.

**`fitTerminalToContainer(term, metricsRef)`** — calls `term.resize(cols, rows)` if dimensions changed, then clears `term.element.style.height = ""` (WTerm `_lockHeight()` sets inline height; project CSS uses `height: 100%` instead).

### 4.2 Resize Flow

1. **Auto-resize on dimension change:**
   - `window resize` event listener (main.tsx line ~460) → `fitTerminalToContainer()` → `term.resize()` → WTerm's `onResize` callback → `scheduleResizeActivePane(cols, rows)`
   - `scheduleResizeActivePane` defers to `resizeScheduler.current` (150ms debounce)
   - `resizeScheduler.current`: HTTP `POST /api/panes/{id}/resize` + refresh snapshot + refresh pane capture if following

2. **On stream connect (connectTerminalStream):**
   - `resizeActivePane(paneId, term.cols, term.rows)` called **before** WebSocket open
   - Then `sendTerminalResize(socket, term.cols, term.rows)` after socket opens

3. **Cell metrics caching:** `terminalCellMetrics` ref memoizes the first measurement to avoid re-measuring on every fit (font shouldn't change at runtime).

---

## 5. Scroll System

**File:** `apps/website/src/terminal/terminal-scroll.ts`

### 5.1 Mechanics

WTerm manages its own scrollback via `has-scrollback` CSS class and `overflow-y: auto` on `.wterm`. The scroll system interacts with the native `element.scrollTop`.

```ts
// Follow mode toggle
function followTerminalOutput(element, followRef) {
  followRef.current = true;
  scrollTerminalToBottom(element);
}

function scrollTerminalToBottom(element) {
  element.scrollTop = element.scrollHeight;
  requestAnimationFrame(() => element.scrollTop = element.scrollHeight);
  setTimeout(() => {
    element.scrollTop = element.scrollHeight;
    requestAnimationFrame(() => element.scrollTop = element.scrollHeight);
  }, 0);
}

function isScrolledToBottom(element)   → gap <= 2px
function isScrolledNearTop(element)    → scrollTop <= 2px
```

### 5.2 Scroll event listener

Installed in `ensureTerminal()` (line ~150):

```ts
element.addEventListener("scroll", () => {
  if (isScrolledNearTop(element)) {
    terminalShouldFollow.current = false; // user scrolled up
    return;
  }
  if (isScrolledToBottom(element)) {
    terminalShouldFollow.current = true; // user returned to bottom
  }
});
```

### 5.3 Follow state usage

- `renderTerminal()` reads `terminalShouldFollow.current` before writing
- `connectTerminalStream()` reads before each `term.write()`
- `sendKeys()`, `sendInput()`, `sendTerminalData()` call `followTerminalOutput()` to re-enable following before sending input

---

## 6. CSS for Terminal Rendering

### 6.1 Project terminal.css

**File:** `apps/website/src/styles/terminal.css`

Key rules:

```css
/* Layout grid */
.terminal-shell {
  grid-template-rows: 42px minmax(0, 1fr) 54px;
}

/* Terminal container — absolute positioning for overlay */
.terminal-wrap {
  position: relative;
  overflow: hidden;
  background: #010102;
}

/* Terminal element — fills container */
.terminal {
  height: 100%;
  overflow: hidden; /* WTerm toggles to overflow-y:auto via .has-scrollback */
  background: #010102;
}

/* WTerm overrides */
.wterm {
  width: 100%;
  height: 100%;
  border-radius: 0;
  padding: 8px 10px;
  box-shadow: none;
  color: var(--term-fg);
  --term-bg: #010102;
  --term-fg: #f7f8f8;
  --term-cursor: #5e6ad2;
  --term-font-family: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, ...;
  --term-font-size: 14px;
  --term-line-height: 1.2;
  --term-row-height: 17px;
}

.wterm.focused {
  outline: 1px solid rgba(94, 106, 210, 0.45);
}

/* WTerm scrollback — project enables scroll */
.terminal.wterm.has-scrollback {
  overflow-y: auto;
}
```

### 6.2 @wterm/dom terminal.css (upstream)

**File:** `node_modules/.pnpm/@wterm+dom@0.3.0/node_modules/@wterm/dom/src/terminal.css`

Imported via `import "@wterm/dom/css"`. Provides:

- `.wterm` base styles (default light-on-dark, padding, border-radius, overflow:hidden)
- `.term-grid`, `.term-row`, `.term-row > span` layout
- `.term-block` (1ch width)
- `.term-cursor`, `.wterm.focused .term-cursor`, `.cursor-blink` animation
- `.wterm.has-scrollback` (`overflow-y: auto`)
- Theme variants (`.theme-solarized-dark`, `.theme-monokai`, `.theme-light`)
- Selection style

### 6.3 Design Tokens

**File:** `apps/website/src/styles/tokens.css`

```css
:root {
  --primary: #5e6ad2;
  --primary-hover: #828fff;
  --canvas: #010102;
  --surface-1: #0f1011;
  --surface-2: #141516;
  --surface-3: #18191a;
  --hairline: #23252a;
  --ink: #f7f8f8;
  --ink-muted: #d0d6e0;
  --ink-subtle: #a1a7b0;
  /* ... */
}
```

---

## 7. API Client

**File:** `apps/website/src/api/client.ts`

```ts
export const apiBase = import.meta.env.VITE_API_BASE ?? "";
export const apiTokenStorageKey = "tmuapp.apiToken";

export async function request<T>(path, init?) → fetch with JSON, auth headers
export function streamUrl(path) → ws:// or wss:// URL with token query param
export function apiToken() → configuredToken || localStorage fallback
```

The `streamUrl()` function:

1. Parses `apiBase` as a URL relative to `window.location`
2. Switches protocol to `ws:`/`wss:`
3. Sets pathname to the given path
4. Appends `?token=...` if token exists

---

## 8. Design System Constraints

**File:** `apps/website/src/design/README.md`

Key rules affecting terminal rendering:

- **Posture:** "black cockpit for tmux workspaces" — near-black surfaces, precise hairlines
- **Accent:** `--primary` (#5e6ad2) is the only brand accent — used for CTA, focus, active state
- **No one-off hex colors** in components — add semantic tokens first
- **Terminal CSS boundary:** AI must not edit `src/terminal/*` or `.wterm` CSS unless the task explicitly touches Terminal
- **Two-mode architecture:** Fleet (overview) + Cockpit (manager)
- **Anti-slop:** no gradients, glassmorphism, emoji UI, rainbow status, marketing copy

---

## 9. Data Flow Summary

### 9.1 Capture → ANSI Normalization → Write

```
HTTP GET /api/panes/{id}/capture?lines=240
  → CaptureResult { ansi, terminal: {rows, cols, cursorRow, cursorCol} }
  → normalizeAnsi(capture.ansi)          [terminal-protocol.ts: adds \r before \n]
  → term.write(normalizedAnsi)           [WTerm: bridge.writeString() → _scheduleRender()]
  → scrollTerminalToBottomIfFollowing()
```

### 9.2 WebSocket Stream Flow

```
new WebSocket(streamUrl(`/api/panes/{id}/stream`))
  → socket "open": sendTerminalResize(socket, cols, rows)
  → socket "message": parseTerminalStreamMessage(data)
    → type "output": term.write(payload.data) → scrollToBottomIfFollowing
    → type "error": notice + fallback to HTTP capture
  → WTerm onData callback: sendTerminalData(data)
    → if stream open: sendTerminalCommand(socket, {type:"input", data})
    → if not: HTTP POST /api/panes/{id}/input → refreshActivePane
```

### 9.3 Resize Flow (from WTerm onResize)

```
WTerm.onResize(cols, rows)
  → scheduleResizeActivePane(cols, rows)
  → resizeScheduler.current (150ms debounce)
    → sendTerminalResize(stream, cols, rows)
    → HTTP POST /api/panes/{id}/resize {width, height}
    → HTTP GET /api/sessions → applySnapshot
    → if following: refreshActivePane(paneId)
```

### 9.4 Resize Flow (from window resize)

```
window resize event
  → fitTerminalToContainer(term, metrics)
    → measureTerminalFit() → new cols/rows
    → term.resize(cols, rows) → onResize callback
    → term.element.style.height = "" (clear lock)
  → scheduleResizeActivePane(cols, rows)
```

---

## 10. WTerm Integration Points — What Would Change to Swap Backend

### 10.1 Direct WTerm references in main.tsx

| Location                                                                  | WTerm usage                      | Impact if swapped     |
| ------------------------------------------------------------------------- | -------------------------------- | --------------------- |
| `ensureTerminal()`                                                        | `new WTerm(element, opts)`       | Constructor replaced  |
| `ensureTerminal()`                                                        | `term.init()`                    | Init replaced         |
| `ensureTerminal()`                                                        | `term.cols`, `term.rows`         | Accessor interface    |
| `fitTerminalToContainer()`, `renderTerminal()`, `connectTerminalStream()` | `term.write(data)`               | Write interface       |
| `fitTerminalToContainer()`                                                | `term.resize(cols, rows)`        | Resize interface      |
| `fitTerminalToContainer()`                                                | `term.element`                   | DOM element reference |
| `resetTerminalSnapshot()`                                                 | `term.bridge?.init(cols, rows)`  | Bridge access         |
| `fitTerminalToContainer()`                                                | `term.element.style.height = ""` | DOM manipulation      |

### 10.2 Files that import from @wterm/dom

- `apps/website/src/main.tsx` — `import { WTerm } from "@wterm/dom"`, `import "@wterm/dom/css"`
- `apps/website/src/terminal/terminal-fit.ts` — depends on `.term-row` class names and `term.resize()`/`term.cols`/`term.rows`/`term.element` interface

### 10.3 Files that depend on WTerm DOM structure

- `apps/website/src/terminal/terminal-fit.ts` — `measureTerminalCell()` creates probe `<div class="term-row"><span>W</span></div>`
- `apps/website/src/styles/terminal.css` — `.wterm`, `.term-grid`, `.term-row`, `.term-row > span`, `.term-block`, `.term-cursor`
- `apps/website/tests/e2e/terminal.spec.ts` — locates `.term-row`, `.term-cursor`, reads terminal element metrics

### 10.4 TerminalCore interface as swap boundary

The `WTermOptions.core` parameter accepts any `TerminalCore` implementation. The `@wterm/core` package provides both `WasmBridge` (default, Zig WASM) and `TerminalCore` interface. A new backend would:

1. Implement `TerminalCore`
2. Be passed via `new WTerm(el, { core: myCore })` — no changes to WTerm/renderer needed
3. Or replace WTerm entirely (more invasive) — would need to replicate the DOM render and input handler

### 10.5 What must stay compatible

- **Element reference:** `terminalElement` ref (`<div ref={terminalElement} id="terminal" className="terminal" />`)
- **`write(data: string)` interface** — ANSI string input
- **`resize(cols, rows)` interface** — grid resize
- **`.cols`, `.rows` properties** — read by fit system
- **`.element` property** — DOM element for scroll/fit overlay manipulation
- **`onData` callback** — keyboard input forwarding
- **`onResize` callback** — terminal-initiated resize notification
- **Scroll behavior:** auto-follow toggle, scroll-to-bottom on write, user-scroll detection

---

## 11. Key Files Index

| File                                                   | Role                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `apps/website/src/main.tsx`                            | App component, WTerm lifecycle, orchestration               |
| `apps/website/src/terminal/terminal-protocol.ts`       | WebSocket message types, ANSI normalization, stream helpers |
| `apps/website/src/terminal/terminal-fit.ts`            | Cell measurement, container-to-grid calculation, resize     |
| `apps/website/src/terminal/terminal-scroll.ts`         | Scroll-to-bottom, follow mode, scroll state detection       |
| `apps/website/src/api/client.ts`                       | HTTP fetch wrapper, WebSocket URL builder, auth token       |
| `apps/website/src/styles/terminal.css`                 | Project terminal CSS (overrides @wterm/dom defaults)        |
| `apps/website/src/styles/tokens.css`                   | Design tokens (colors, fonts)                               |
| `apps/website/src/styles/layout.css`                   | App shell grid, manager body grid                           |
| `apps/website/src/styles/components.css`               | Terminal toolbar, input row, button styles                  |
| `apps/website/src/design/README.md`                    | Design system rules and constraints                         |
| `apps/website/tests/e2e/terminal.spec.ts`              | 16 Playwright e2e tests for terminal                        |
| `apps/api/src/tmux-stream.ts`                          | Server-side tmux control mode streaming                     |
| `apps/api/src/server.ts`                               | HTTP/WebSocket server, route handlers                       |
| `packages/utils/src/index.ts`                          | Shared TmuxSnapshot/TmuxPane types, sanitization            |
| `node_modules/.../@wterm/dom/dist/wterm.d.ts`          | WTerm class API                                             |
| `node_modules/.../@wterm/dom/dist/renderer.js`         | DOM renderer (term-grid spans)                              |
| `node_modules/.../@wterm/core/dist/terminal-core.d.ts` | TerminalCore interface (swap boundary)                      |
| `node_modules/.../@wterm/core/dist/wasm-bridge.d.ts`   | WasmBridge (default Zig WASM core)                          |
