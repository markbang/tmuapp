# Implementation Meta-Prompt — Web Cockpit Refactor

You are a `talesofai/deepseek-v4-pro` implementation worker. Implement a focused web terminal UI refactor for tmuapp. Follow `apps/website/src/design/README.md`: black cockpit, near-black surfaces, precise hairlines, one lavender accent, no decorative gradients, no glassmorphism, no emoji UI, no fake metrics.

## Read first

- `apps/website/src/design/README.md`
- `handoff/refactor/visual-review.md`
- `apps/website/src/main.tsx`
- `apps/website/src/terminal/terminal-adapter.ts`
- `apps/website/src/terminal/terminal-fit.ts`
- `apps/website/src/terminal/terminal-protocol.ts`
- `apps/website/src/styles/tokens.css`
- `apps/website/src/styles/base.css`
- `apps/website/src/styles/layout.css`
- `apps/website/src/styles/components.css`
- `apps/website/src/styles/terminal.css`
- `apps/website/src/styles/responsive.css`
- `apps/website/tests/e2e/terminal.spec.ts`

## Goals

1. Split monolithic `main.tsx` into a `components/` directory while preserving behavior and test selectors.
2. Add terminal search using `@xterm/addon-search` with an inline Cockpit search strip.
3. Add font size controls and shortcuts (`Cmd/Ctrl +=`, `Cmd/Ctrl +-`, `Cmd/Ctrl+0`).
4. Add recent-output activity indicators on window/pane tabs.
5. Apply visual polish and remove DESIGN.md violations.

## Non-negotiable constraints

- Do not regress terminal/TUI correctness.
- Do not reintroduce xterm `onKey` forwarding for raw input. Terminal raw input must use `onData` only.
- Preserve WebSocket streaming and `normalizeAnsi(payload.data)` for live output.
- Preserve Back → Fleet → open session terminal recreation/disposal behavior.
- Preserve existing class names and accessible labels used by e2e tests unless tests are updated in the same change.
- Keep the terminal as the primary Cockpit surface. Do not add a decorative terminal skin.
- Use existing CSS tokens; add semantic tokens only if truly needed.

## Package changes

Update `apps/website/package.json` and lockfile via workspace package manager:

- Add dependency: `@xterm/addon-search` using the repo catalog/versioning pattern if available.

Inspect `pnpm-workspace.yaml` / catalogs before adding a hardcoded version. Prefer the repository’s existing dependency style.

## File-level implementation plan

### 1. Component extraction

Create `apps/website/src/components/` and move presentational components out of `main.tsx`.

Recommended files:

- `components/StatusChip.tsx`
- `components/NoticeBanner.tsx`
- `components/EmptyState.tsx`
- `components/SessionComposer.tsx`
- `components/SessionGrid.tsx`
- `components/WindowStrip.tsx`
- `components/PaneStrip.tsx`
- `components/TerminalToolbar.tsx`
- `components/TerminalSearchBar.tsx`
- `components/InputRow.tsx`
- `components/TokenPanel.tsx`
- `components/ConfirmWindowKill.tsx`
- Optional: `components/InlineLoading.tsx`

Keep `App` in `main.tsx` as the orchestrator for API calls, terminal lifecycle, WebSocket stream, snapshot/selection state, and shortcuts.

If helper functions become shared, create:

- `apps/website/src/tmux-selection.ts` or `apps/website/src/tmux-helpers.ts`

Move pure helpers only if it reduces prop coupling. Avoid a broad architecture rewrite.

### 2. Terminal adapter search/font API

Modify `apps/website/src/terminal/terminal-adapter.ts`.

Extend `TermAdapter` with minimal methods/properties:

```ts
search(query: string, options?: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean; incremental?: boolean }): boolean;
searchNext(query: string, options?: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }): boolean;
searchPrevious(query: string, options?: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }): boolean;
setFontSize(size: number): void;
getFontSize(): number;
```

Implementation notes:

- Import and load `SearchAddon` from `@xterm/addon-search`.
- Hold `const searchAddon = new SearchAddon();` and `term.loadAddon(searchAddon);` before `term.open(element)`.
- Map methods to addon methods (`findNext`, `findPrevious`) after checking the current API from installed package types.
- `setFontSize(size)` should set `term.options.fontSize = size`.
- `getFontSize()` should return `Number(term.options.fontSize) || default`.
- Keep existing WebGL, ligatures, and image addons.
- Keep `_xtermInstance` exposure for e2e.

### 3. Font size state and resize/refit integration

In `main.tsx`:

- Add localStorage key, e.g. `tmuapp:terminal-font-size`.
- Default: `14`.
- Clamp range: 10–24.
- Initialize font size state from localStorage.
- Pass font size into `createTerminal` via a new `fontSize` option.
- On font size change:
  - update adapter via `terminal.current?.setFontSize(nextSize)`;
  - persist to localStorage;
  - clear `terminalCellMetrics.current = undefined`;
  - wait for layout/animation frame;
  - call `fitTerminalToContainer(...)`;
  - update `setFitSize(`${cols}x${rows}`)`;
  - call `scheduleResizeActivePane(cols, rows)`.

Keyboard shortcuts:

- macOS-style: `Meta+=`, `Meta++`, `Meta+-`, `Meta+0`.
- Linux/Windows fallback: `Ctrl+=`, `Ctrl++`, `Ctrl+-`, `Ctrl+0`.
- Also accept `Ctrl+Shift+=` for keyboard layouts where plus requires shift.
- Do not trigger these shortcuts when an input/textarea/select is focused, except the xterm textarea is allowed if safe.
- Prevent default browser zoom for handled terminal font shortcuts.

Toolbar controls:

- Add compact controls to `TerminalToolbar`:
  - Decrease button, label like `14px`, Increase button, Reset button.
- Use existing button classes or add tokenized compact variants.
- Use `aria-label` on icon/symbol buttons.

### 4. Terminal search UI

Add `TerminalSearchBar.tsx` and CSS in `terminal.css` or `components.css`.

State in `main.tsx` or a Cockpit component:

```ts
const [searchOpen, setSearchOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState("");
const [searchOptions, setSearchOptions] = useState({
  caseSensitive: false,
  regex: false,
  wholeWord: false,
});
```

UI requirements:

- Inline strip inside `.terminal-shell`, ideally between `.terminal-toolbar` and `.terminal-wrap`.
- Update grid rows when open, e.g. `grid-template-rows: 42px auto minmax(0, 1fr) 54px` via a class like `.terminal-shell.search-open`.
- Input placeholder: `Search scrollback…`.
- Buttons: Previous, Next, Case, Regex, Word, Close.
- Keep compact and black-cockpit styled.

Shortcut mappings:

- Open search:
  - `Meta+f` (macOS)
  - `Ctrl+Shift+f` (Linux/Windows fallback)
- Find next:
  - `Meta+g`
  - Enter while search input focused
- Find previous:
  - `Meta+Shift+g`
  - Shift+Enter while search input focused
- Close search:
  - Escape while search input focused

Do **not** steal plain `Ctrl+F` from terminal apps on Linux/Windows because terminal applications may use it. `Meta+F` is safe on macOS; `Ctrl+Shift+F` is the safer cross-platform terminal convention.

Search behavior:

- On query change, call `terminal.current?.search(query, { incremental: true, ...options })` if non-empty.
- Previous/next call adapter methods.
- If possible, expose match found/not found state, but match count is optional for this pass because xterm search addon may not provide a simple count API.

### 5. Activity indicators

Add recent output tracking in `main.tsx`:

```ts
const [paneActivity, setPaneActivity] = useState<Record<string, number>>({});
```

When stream payload type is `output` and `payload.data.length > 0`:

- Update `paneActivity[paneId] = Date.now()`.
- If pane is not selected (future/background case), it should show as active.
- For now, because only selected pane is streamed, show activity for selected pane as a subtle live dot and preserve API for future background events.

Pass activity timestamps to:

- `WindowStrip`
- `PaneStrip`

Implementation helper:

- A window is active/recent if any pane under that window has timestamp within last 5000ms.
- A pane is active/recent if its timestamp is within last 5000ms.
- Use a lightweight interval (`setInterval` every 1000ms) only while in manage view to refresh visual expiry.

CSS:

- Add `.tab-activity-dot` / `.window-tab.has-activity` / `.pane-tab.has-activity`.
- Dot: 6px, `background: var(--primary)`, `border-radius: 999px`.
- Pulse can reuse `status-pulse`; keep it subtle.
- Do not add random green/orange/red unless semantically backed by process state.

### 6. Visual polish / DESIGN.md compliance

CSS changes:

- `layout.css`
  - Remove `.topbar { backdrop-filter: blur(10px); }`.
  - Prefer opaque topbar: set `--topbar-bg` to `var(--canvas)` in tokens or `background: var(--canvas)` on `.topbar`.
- `components.css`
  - Remove `.window-strip::after` gradient entirely, or replace with a non-gradient solid end cap/hairline.
  - Keep tab classes and dimensions stable.
  - Add activity dot styles.
- `terminal.css`
  - Replace hardcoded `#010102` backgrounds with `var(--canvas)`.
  - Replace decorative terminal inner shadow with hairline/inset border or remove.
  - Add search strip styles.
  - Add compact font controls styles if needed.
  - Strengthen `.terminal .xterm.focus` minimally: e.g. `outline: 1px solid var(--primary-focus-border)`.
- `responsive.css`
  - Ensure search bar wraps cleanly below 560px.
  - Ensure toolbar font controls remain reachable via horizontal overflow or wrapping.

Token guidance:

- Use:
  - `--canvas`
  - `--surface-1`, `--surface-2`, `--surface-3`
  - `--hairline`, `--hairline-strong`
  - `--primary`, `--primary-subtle-bg`, `--primary-subtle-border`
  - `--primary-focus-border`, `--primary-focus-shadow`, `--primary-focus-outline`
  - `--ink`, `--ink-muted`, `--ink-subtle`, `--ink-tertiary`
- Do not add one-off hexes in React/CSS for product chrome.

## Test updates

Update `apps/website/tests/e2e/terminal.spec.ts` or add a focused new e2e file if cleaner.

Coverage to preserve/add:

1. Existing tests still pass.
2. Search UI:
   - `Cmd/Ctrl+Shift+F` opens search bar.
   - Typing a query calls xterm search behavior enough to show the search input and not break terminal.
   - Escape closes search and returns focus appropriately.
3. Font size:
   - Font size label starts at default/persisted value.
   - Shortcut increase/decrease/reset updates label.
   - Browser zoom is not triggered for handled shortcuts if observable.
4. Activity dots:
   - Stream output causes selected pane/window to expose an activity class/dot.
5. Design compliance smoke:
   - No gradient pseudo-element assertions are hard in Playwright, but DOM classes should remain and terminal boundary should still contain terminal only.

Be careful with Playwright environment caveat: stop the real API on `localhost:8787` before mocked e2e if needed, because Vite proxy can otherwise connect WebSocket to real tmux and bypass mocks.

## Validation commands

Run the narrow and broad checks that are practical:

```bash
cd /home/bangwu/code/tmuapp
vp check --fix
vp run website#e2e
```

If full e2e fails due local Chromium/Playwright environment instability, run targeted tests and report the environment failure clearly with logs. Do not hide failures.

## Expected output summary

Report:

- Changed files.
- Search/font/activity behavior implemented.
- Component extraction done.
- Validation commands and results.
- Any remaining risks, especially search addon API compatibility or Playwright environment limitations.
