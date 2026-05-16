# Web UI Redesign — Requirements Context

> Generated from full codebase analysis of `apps/website/src/main.tsx`, all CSS files, `apps/website/src/design/README.md`, terminal modules, e2e tests, and web research on terminal-native UI patterns.

---

## 1. Architecture Overview

### 1.1 Entry points and file map

| File                                             | Role                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/index.html`                        | Single `<div id="app">` shell, meta theme-color `#010102`                                                                                                                                                                                                                                                 |
| `apps/website/src/main.tsx`                      | **Single 1635-line monolithic React component** containing `App` + all sub-components: `SessionGrid`, `SessionComposer`, `WindowStrip`, `TokenPanel`, `ConfirmWindowKill`, `EmptyState`, `NoticeBanner`, `StatusChip`, plus all helper functions (`reconcileSelection`, `previewText`, `stripAnsi`, etc.) |
| `apps/website/src/style.css`                     | Import barrel: tokens → base → layout → components → terminal → responsive                                                                                                                                                                                                                                |
| `apps/website/src/styles/tokens.css`             | Design tokens: colors, spacing, radii, fonts                                                                                                                                                                                                                                                              |
| `apps/website/src/styles/base.css`               | Reset, skip-link, focus-visible                                                                                                                                                                                                                                                                           |
| `apps/website/src/styles/layout.css`             | App shell grid, topbar, workspace, overview, session grid/composer, notice, empty states, inline loading, skeleton animation, notice-slide-in                                                                                                                                                             |
| `apps/website/src/styles/components.css`         | Floating panels (modals), manager body, window/pane strips and tabs, button styles (primary/ghost/danger/icon), status chips, inputs                                                                                                                                                                      |
| `apps/website/src/styles/terminal.css`           | Terminal shell grid, toolbar, wrap, xterm.js overrides, input row                                                                                                                                                                                                                                         |
| `apps/website/src/styles/responsive.css`         | Breakpoints at 980px and 560px, reduced-motion                                                                                                                                                                                                                                                            |
| `apps/website/src/terminal/terminal-adapter.ts`  | xterm.js factory: Terminal options, addons (WebGL, ligatures, image), theme, onData/onKey/onResize wiring, auto-copy on selection + lavender flash, `_xtermInstance` exposed for e2e                                                                                                                      |
| `apps/website/src/terminal/terminal-fit.ts`      | Character-cell measurement, fit-to-container resize                                                                                                                                                                                                                                                       |
| `apps/website/src/terminal/terminal-protocol.ts` | WebSocket message types, `normalizeAnsi` (adds `\r` before bare `\n`), send helpers                                                                                                                                                                                                                       |
| `apps/website/src/terminal/terminal-scroll.ts`   | Viewport scroll helpers: follow, isScrolledToBottom, isScrolledNearTop, double-check smooth-scroll                                                                                                                                                                                                        |
| `apps/website/src/api/client.ts`                 | `request<T>()` wrapper, `streamUrl()` WebSocket builder, API token from env or localStorage                                                                                                                                                                                                               |
| `apps/website/tests/e2e/terminal.spec.ts`        | 14 Playwright tests covering capture, keyboard, resize, scrollback, tabs, token, kill confirm, preview fallback, offline, empty state                                                                                                                                                                     |

### 1.2 Dependency landscape (from package.json)

- **@heroui/react** — Button, Card, Chip, Input, Spinner, Alert (design system)
- **@xterm/xterm** — terminal emulator core
- **@xterm/addon-webgl** — GPU-accelerated renderer
- **@xterm/addon-ligatures** — font ligatures
- **@xterm/addon-image** — sixel/IIP image protocols
- **@wterm/dom** — listed but not imported in current codebase
- **Not present**: `@xterm/addon-search`, `@xterm/addon-fit` (terminal-fit.ts does custom measurement instead using DOM probes and xterm internal dimensions)

### 1.3 View model (two views)

| View                 | Routing                    | Purpose                                                 |
| -------------------- | -------------------------- | ------------------------------------------------------- |
| `"overview"` (Fleet) | Default on load            | Session grid, create session composer, session previews |
| `"manage"` (Cockpit) | Set on session open/create | Terminal viewport, window/pane tabs, input row          |

State managed via `useState` in App — no router, no URL persistence. Selection is a `Selection` type (`{ session?, window?, pane? }`). View switching is imperative.

---

## 2. Fleet (Overview) View Audit

### 2.1 Session cards

**Layout**: CSS Grid `repeat(auto-fill, minmax(300px, 1fr))` with 12px gap, max-width 1360px centered. Cards are fixed `height: 238px` with `content-visibility: auto`.

**Information hierarchy** (top to bottom):

1. Session name (bold 16px) + attached/detached StatusChip — `session-card-top`
2. Stats row: `N windows`, `N panes`, current command — pill-shaped tags with `session-stats`
3. Working directory path — monospace 12px `session-path`
4. Terminal preview — monospace 12px pre element in `preview-bg` container

**Preview states**:

- `loading`: skeleton-pulse animation, text hidden
- `ready`: ANSI-stripped last 5 non-empty lines in `preview-text` color
- `fallback`: Shows `currentCommand` or `currentPath` or pane id in muted color (API capture failed)
- `empty`: "No panes" in muted color

**Interactive states**:

- Default: `surface-1` bg, `hairline` border
- Hover: `surface-2` bg, `primary-dim-border`, `translateY(-1px)` lift
- Selected: primary accent left border (`box-shadow: inset 3px 0 0 var(--primary)`), `primary-dim-border`
- Active: `translateY(1px)` press-down

**Issues found**:

- **Card height is fixed at 238px** — content can overflow and be hidden. The preview area uses `min-height: 0; overflow: hidden` to clip, but truncation of session name (via `text-overflow: ellipsis`) works. Stats row wraps with `flex-wrap: wrap`.
- **No session reordering** — sessions appear in API order (tmux creation order). No drag-and-drop or sort controls.
- **No search/filter** for large session lists.
- **No batch operations** — can't select multiple sessions for kill/attach.
- **Preview captures 8 lines** via HTTP per session for the grid. With many sessions this can be chatty on load.

**Responsive behavior (mobile)**:

- At ≤560px: cards go single-column
- Session name and pills fit in `session-card-top`, stats wrap
- Path and preview remain visible

### 2.2 Session composer

**Layout**: CSS Grid `minmax(190px, 0.65fr) minmax(180px, 0.9fr) minmax(220px, 1.15fr) auto` with 10px gap, inside a bordered `surface-1` card.

**Fields**:

- Description text ("New tmux session" + name rules)
- Session name Input (`session-name`)
- Working directory Input (`session-cwd`, optional)
- Cancel/Create buttons

**Validation**: Only name required (trim check). CWD is entirely free-form — no path validation, no tilde expansion hints, no autocomplete.

**Responsive**:

- ≤980px: collapses from 4-column to 2-column; copy text and actions span full width
- ≤560px: single column, buttons stretch full width

**Issues**:

- No tooltip or help text explaining what CWD accepts (absolute path, relative to tmux server?)
- No default name suggestion visible in the form (default name is generated but only used programmatically)

### 2.3 Empty/error/loading states

- **Loading**: `InlineLoading` component — centered Spinner + label text, `surface-1` bg, `hairline` border, min-height 190px
- **Offline (API error)**: `EmptyState` with `tone="danger"` — danger border and background, "tmux API is offline" title, retry button
- **No sessions (empty)**: `EmptyState` with `tone="neutral"` — neutral border, "No tmux sessions" title
- **session-preview.loading**: Skeleton pulse animation within card

**Issues**:

- EmptyState uses HeroUI `Card` component for the danger variant; neutral variant is a custom div
- No "first run" guided experience — just shows empty state
- No differentiation between "API reachable but tmux not running" vs "network error"

---

## 3. Cockpit (Manage) View Audit

### 3.1 Layout structure

`manager-body` CSS grid:

```
grid-template-rows: auto minmax(0, 1fr) 54px auto;
```

- Row 1: Window strip (50px height or empty-line)
- Row 2: Terminal shell (fills remaining space)
- Row 3: Input row (54px)
- Row 4: Pane strip (auto height, only visible when >1 pane)

`terminal-shell` sub-grid:

```
grid-template-rows: 42px minmax(0, 1fr) 54px;
```

- Row 1: Terminal toolbar (42px)
- Row 2: Terminal wrap (fills remaining)
- Row 3: Input row (54px) — duplicate specification, redundant with manager-body row 3

### 3.2 Terminal toolbar

**Content** (left to right):

- Pane title or currentCommand or "No pane selected" — `terminal-heading` with optional pulsing dot during loading
- Dimensions: `WxH path` in muted text
- Actions group (separated by `border-left` hairline):
  - Split H button (ghost)
  - Split V button (ghost)
  - Kill Window button (danger)

**Issues**:

- **No terminal-native controls**: Missing font size +/-, search toggle, theme selector, copy button
- **Dimensions shown as static text** — doesn't update live during resize
- **No terminal focus indicator** — only xterm's internal `.focus` class outline on the `.xterm` element
- **Split/Kill buttons have no icons** — pure text, low scanability
- **Loading indicator** (pulsing dot) is subtle — easily missed

### 3.3 Window strip

**Layout**: Horizontal flex row, `overflow: auto hidden`, height 50px, `surface-1` bg, `hairline` bottom border.

**Tab design**:

- HeroUI `Button` components with `role="tablist"` on container, `role="tab"` implicit via Button
- Each tab: `window.index:window.name` + pane count `<small>`
- Max width 220px, truncated with `text-overflow: ellipsis`
- Selected state: `primary-subtle-border` + `primary-subtle-bg`
- Hover: `hairline-strong` border, `surface-2` bg

**Sticky fade**: `::after` pseudo-element with `linear-gradient(to right, transparent, var(--surface-1))` — 24px wide at right edge.

**Keyboard navigation**: Alt+1-9 selects window by index, Alt+ArrowLeft/Right cycles windows, Ctrl+Alt+ArrowLeft/Right cycles panes. Works when no form element is focused.

**Issues**:

- **Sticky fade uses gradient** — violates DESIGN.md anti-slop rule "no gradients as decoration"
- **No ARIA attributes** on the gradient pseudo-element (it's decorative, so `aria-hidden` would be appropriate but can't be set on pseudo-elements)
- **Tabs are HeroUI Buttons** with `role="tablist"` — this is somewhat accessible but HeroUI Button adds its own DOM wrapper that may interfere with ARIA semantics
- **No activity indicators** — can't tell which window has active output
- **No drag-to-reorder** — window order is fixed
- **No close button** on individual tabs — must select window then use Kill Window in toolbar
- **No "new window" button** in the strip

### 3.4 Pane strip

**Layout**: Same pattern as window strip but at bottom, `border-top: 1px solid var(--hairline)`, `surface-1` bg, `padding: 8px 14px`.

**Tab design**:

- HeroUI `Button` components with `role="tablist"`, `aria-selected`, `aria-controls="terminal-panel"`
- Each tab: `pane.index:pane.title or currentCommand or pane.id`
- Font size 12px, min-height 30px, border-radius 6px
- Selected state: same primary accent pattern as window tabs

**Issues**:

- **No activity indicators** on individual panes
- **No close/kill button** on pane tabs
- **Pane strip only visible when >1 pane** — single-pane sessions lose the tab context
- **No drag-to-reorder panes**
- **Tab labels can be very long** (full command path) with only `text-overflow: ellipsis` truncation

### 3.5 Input row

**Layout**: Horizontal flex, `padding: 9px 10px`, `surface-1` bg, `hairline` top border.

**Elements**:

- Label: "Send command to active pane" (hidden at ≤980px and ≤560px)
- Pane input: HeroUI `Input` component, placeholder `printf "hello"…`, `autoComplete="off"`
- Run button: HeroUI `Button` primary, disabled when no pane or empty input
- Optional pane count pill: visible when >1 pane

**Tab key handling**: When Tab is pressed in the input with no modifiers, `event.preventDefault()` is called and `sendInputKey("Tab", inputValue)` sends the current text + Tab key to the pane (for shell completion). This is a deliberate UX choice.

**ArrowUp/ArrowDown**: Not intercepted in the input — the terminal (via xterm's onKey) handles them only when the terminal textarea is focused. This means shell history navigation via arrow keys requires focus in the terminal, not the input row.

**Issues**:

- **No shell history** — the input row doesn't remember previous commands. Native terminals have Ctrl+R/arrow-up history.
- **Input label is a `<span>` not `<label>`** — proper `htmlFor` association possible but complicated by HeroUI's input wrapper
- **Run button is always visible** even though Enter in terminal also works — redundant UI element
- **No auto-focus** on the input when switching panes/sessions — requires manual click

### 3.6 Terminal viewport

**Container**: `.terminal-wrap` — relative, overflow hidden, `background: #010102`, `box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3)`.

**xterm.js overrides**:

- `.xterm`: 100% width/height, `padding: 8px 10px`, no border-radius
- `.xterm.focus`: `outline: 1px solid var(--primary-focus-ring)`, `outline-offset: -1px`
- `.xterm-viewport`: `scroll-behavior: smooth`, `overscroll-behavior: contain`
- Text selection: `background: rgba(94, 106, 210, 0.35)` on `.xterm-selection`
- Copy flash: `outline: 2px solid var(--primary)` with 150ms transition

**Adapter configuration** (terminal-adapter.ts):

```ts
fontSize: 14,
fontFamily: defaultFontStack (ui-monospace, SFMono, Menlo, Monaco, Consolas...),
lineHeight: 1.2,
scrollback: 5000,
smoothScrollDuration: 0,
tabStopWidth: 8,
cursorBlink: true,
cursorStyle: "block",
screenReaderMode: true,
theme: hardcoded — background #010102, foreground #f7f8f8, cursor #5e6ad2,
  ansi colors: VS Code Dark+ inspired palette
```

**Remove addons loaded**:

- WebGL (GPU renderer)
- Ligatures
- Image (sixel + IIP)

**Auto-copy**: Terminal text selection auto-copies to clipboard with lavender flash confirmation.

**Issues**:

- **Theme is hardcoded** — no user-selectable terminal color schemes
- **Font size is hardcoded at 14px** — no zoom controls
- **No search addon** (`@xterm/addon-search` not installed, `@xterm/addon-search-bar` not installed)
- **Scrollback of 5000 lines** — reasonable but not configurable
- **Terminal padding (8px 10px)** — reduces usable character grid slightly but prevents edge clipping
- **Switching animation** (`opacity: 0.65` on `.switching`) — subtle, could be more refined
- **`box-shadow: inset 0 2px 8px`** on `.terminal-wrap` — decorative inner shadow, mild violation of anti-slop rules

### 3.7 Current anti-patterns vs DESIGN.md

| Element                | Anti-pattern                                              | Severity   | DESIGN.md rule violated           |
| ---------------------- | --------------------------------------------------------- | ---------- | --------------------------------- |
| `.window-strip::after` | `linear-gradient(...)` for sticky fade                    | **High**   | "No gradients as decoration"      |
| `.topbar`              | `backdrop-filter: blur(10px)`                             | **Medium** | "No glassmorphism"                |
| `.terminal-wrap`       | `box-shadow: inset 0 2px 8px rgba(0,0,0,0.3)`             | **Low**    | Decorative shadow (borderline)    |
| `.session-card:hover`  | `translateY(-1px)` elevation                              | **Low**    | Decorative transform (borderline) |
| `.notice`              | `translateX(20px)` slide-in + `box-shadow: 0 16px 48px`   | **Low**    | Decorative animation (borderline) |
| `.panel-card`          | `scale(0.97)` enter animation + `box-shadow: 0 24px 80px` | **Low**    | Decorative animation (borderline) |
| `.topbar`              | `will-change: transform`                                  | **Info**   | Performance hint, not decorative  |

---

## 4. Global Elements Audit

### 4.1 Topbar

**Structure**: Sticky `z-index: 20`, `backdrop-filter: blur(10px)`, `background: var(--topbar-bg)` (96% opacity near-black), `hairline` bottom border.

**Left**: Brand mark (34x34 primary bg square with "tm" monospace text) + "tmuapp" h1 + "tmux fleet control" subtitle.

**Center** (manage view only): Session context — Back button, session name, window/pane counts, attached/detached chip.

**Right**: Health chip (live/syncing/offline), Refresh button (with spinner while refreshing), Token button, "New Session" primary button.

**Issues**:

- **Back button text is bare** — "Back" without context of what you're going back to
- **Back button uses `className="ghost"`** — visually consistent but not semantically a "ghost" action
- **Health chip packs "live"/"syncing"/"offline"** — no tooltip explaining what these mean
- **No keyboard shortcut hints** anywhere in the topbar

### 4.2 Modals (floating panels)

**Pattern**: `<div className="floating-panel">` backdrop with `modal-backdrop` bg, click-outside-to-close, Escape-to-close. Inner `<div className="panel-card">` with enter animation.

**Token settings panel**:

- Title "API Token", description text
- Password-type Input for bearer token
- Cancel + Save buttons
- Focus trap via `useFocusTrap` hook
- On save: stores to localStorage, triggers background refresh

**Kill confirm panel**:

- Title "Kill Window", description with window index:name
- Warning text: "This action cannot be undone"
- Cancel + Kill Window buttons (Kill uses danger styling)
- `danger-panel-border` on the panel card
- Spinner state while deleting

**Issues**:

- **Both panels share the same CSS class** (`panel-card`) — differentiated only by `.confirm-panel` modifier for danger border
- **No focus-trap on Escape** — `handleDialogKeyDown` handles Escape but doesn't prevent focus leaving via Tab+Shift
- **No aria-describedby** on the kill confirm for the warning message
- **Click-outside behavior** uses the generic `onClick` on backdrop — should use `onMouseDown` to prevent text selection drags from triggering close

### 4.3 Notices (toast)

**Position**: `position: absolute; top: 12px; right: 20px; z-index: 30` inside `.workspace` (not fixed to viewport).

**Width**: `min(520px, calc(100vw - 40px))`.

**Animation**: `notice-slide-in` 300ms ease-out — translates from right.

**Tone variants**:

- `neutral` (default): `surface-2` bg, `hairline-strong` border
- `danger`: `danger-surface` bg, `danger-notice-border`
- `warning`: rgba warning border
- `success`: no specific variant, uses default

**Content**: HeroUI `Alert` component with `Alert.Title` + optional `Alert.Description` + close button.

**Issues**:

- **Not fixed to viewport** — positioned absolute inside workspace, disappears on scroll
- **No auto-dismiss** — requires manual close
- **No stacking** — multiple notices would overlap
- **Success notices have no green styling** — they use the default neutral background

### 4.4 Status indicators

**StatusChip**: HeroUI `Chip` with `.status` + tone class, pill-shaped, 24px min-height, 12px font, 700 weight.

**States**: success (green), warning (amber), danger (red), neutral (gray).

**Used for**: health indicator, attached/detached status, pane count pill.

**Health indicator meanings**:

- `live` (success): API responded, snapshot fresh
- `syncing` (warning): loading or refreshing
- `offline` (danger): API error

---

## 5. What's Missing vs Native Terminals

### 5.1 Search in terminal (Ctrl+F)

**Current**: Not implemented. `@xterm/addon-search` and `@xterm/addon-search-bar` are not installed.

**Design requirement**: Terminal-native — search bar should appear inline within the terminal toolbar (not a floating dialog), with lavender accent for match highlights. Should support:

- Case-sensitive toggle
- Regex toggle
- Whole-word toggle
- Match count display
- Up/down navigation
- Escape to close

**Implementation path**: Install `@xterm/addon-search`, wire to the Terminal instance in `terminal-adapter.ts`. The search bar UI should be a strip inserted into `.terminal-toolbar` (below the toolbar or as a collapsible row), matching the cockpit aesthetic.

### 5.2 Font size controls

**Current**: Hardcoded at 14px in `terminal-adapter.ts`. No UI to change it.

**Design requirement**: Native terminals have Ctrl+Plus/Minus/0 or a toolbar dropdown. Implementation:

- Ctrl+= (or Ctrl+Plus) to increase, Ctrl+- to decrease, Ctrl+0 to reset
- Store preference in localStorage
- Update via `term.options.fontSize = newSize` (xterm.js supports dynamic option changes)
- Show current size in toolbar (e.g., "14px" next to dimensions)
- After font resize, re-fit terminal to container and re-resize tmux pane

**Ripple effect**: Changing font size requires re-measuring cell metrics, re-fitting to container, and sending a new resize to the tmux pane via the API.

### 5.3 Terminal themes

**Current**: One hardcoded theme in `terminal-adapter.ts` (VS Code Dark+ inspired). No theme picker.

**Design requirement**: A terminal theme selector in the toolbar. Pre-built themes:

- Default Dark+ (current)
- Nord
- Dracula
- Solarized Dark
- Monokai
- Custom (user-definable via localStorage)

Theme should be stored in localStorage and applied on terminal init. Use xterm.js `theme` option dynamically (`term.options.theme = ...`).

### 5.4 Session reordering

**Current**: Sessions appear in tmux's creation order. No reorder UI.

**Design requirement**: Drag-and-drop session cards in the Fleet view, or a sort dropdown (by name, by creation time, by activity). This may require API support (no current tmux reorder endpoint). Alternatively, client-side sort only.

### 5.5 Keyboard shortcut help/cheatsheet

**Current**: No help panel. Current shortcuts (Alt+1-9, Alt+Arrows, Ctrl+Alt+Arrows, Ctrl+L) are discoverable only by reading the source code.

**Design requirement**: A keyboard shortcut reference panel (triggered by `?` or a help button in the topbar). Should be a floating panel styled consistently with the cockpit aesthetic. Content should list:

- Global: `?` → show this panel
- Fleet: (none currently)
- Cockpit: Alt+1-9, Alt+Arrows, Ctrl+Alt+Arrows, Ctrl+L, Ctrl+F (search, once implemented)
- Terminal: standard terminal shortcuts (Ctrl+C, Ctrl+D, etc.) — note these go to tmux, not the web UI

### 5.6 Activity indicators on window/pane tabs

**Current**: No visual indication of which window/pane has recent output.

**Design requirement**: When the WebSocket stream delivers output to a pane that is not currently selected, briefly flash or color the corresponding tab indicator. A small dot (like the terminal-status-dot pulsing animation) on inactive window/pane tabs would signal activity. Implementation:

- Track last output timestamp per pane
- Add a CSS class when `Date.now() - lastOutputTime < 2000ms`
- Use a subtle animation (pulsing dot or border highlight in primary color)

### 5.7 Terminal resize handles

**Current**: Resize only via browser window resize (triggers `fitTerminalToContainer` + debounced API resize). No manual resize handle.

**Design requirement**: A resize handle between the terminal toolbar and the terminal wrap (or between terminal and input row) that allows dragging to adjust the terminal's grid size. Implementation:

- A thin draggable divider (4-6px) styled with `hairline` borders
- On drag, calculate new rows/columns based on cell metrics
- Debounced resize via API
- Cursor: `row-resize` or `col-resize`

---

## 6. Design Rule Compliance Checklist

### ✅ Compliant

| Rule                             | Evidence                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Black cockpit aesthetic          | `--canvas: #010102`, near-black surface ladder (`#0f1011` → `#191a1b`)                               |
| Lavender accent only             | `--primary: #5e6ad2` used for focus, selected, primary CTA, status dot, selection background, cursor |
| Semantic danger/success/warning  | Green for attached/live only, red for danger/kill/offline only, amber for syncing/detached only      |
| Terminal monospace / chrome sans | `.session-preview`, `.terminal` use monospace; buttons, headings, labels use Inter/sans stack        |
| CSS variables from tokens.css    | All colors, spacing, radii, shadows reference `--*` tokens                                           |
| No emoji UI                      | Zero emoji used anywhere in the UI                                                                   |
| No fake metrics                  | All counts (windows, panes, sessions) are real API data                                              |
| No oversized rounded cards       | Cards use `border-radius: 8px`, modest size, dense information                                       |
| No marketing copy                | All copy is operational ("Create a tmux session and open it in the browser")                         |
| Dense for real work              | Fleet cards pack 6 data points per card; cockpit maximizes terminal viewport                         |

### ❌ Non-compliant

| Rule                       | Violation                                                  | Location                                | Fix                                                                                             |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No gradients as decoration | `linear-gradient(to right, transparent, var(--surface-1))` | `components.css` `.window-strip::after` | Replace with a solid fade using multiple `box-shadow` stops or a simpler solid-end-cap approach |
| No glassmorphism           | `backdrop-filter: blur(10px)`                              | `layout.css` `.topbar`                  | Remove `backdrop-filter`. Replace with fully opaque `var(--canvas)` background                  |
| No gradients (mild)        | `box-shadow: inset 0 2px 8px rgba(0,0,0,0.3)`              | `terminal.css` `.terminal-wrap`         | Remove or reduce to 1px hairline inset border                                                   |
| No decoration (mild)       | `translateY(-1px)` on hover, `scale(0.97)` on panel open   | `layout.css`, `components.css`          | Remove transforms or gate behind `prefers-reduced-motion: no-preference`                        |

---

## 7. Structural Concerns for Redesign

### 7.1 Monolithic component

The entire application (1635 lines) is a single `main.tsx` file. All sub-components are function declarations inside the same module. This makes it difficult to:

- Test individual components in isolation
- Reuse components across views
- Understand the boundary between concerns
- Apply code-splitting or lazy loading

**Recommendation**: Extract components into a `src/components/` directory:

- `SessionGrid.tsx` / `SessionCard.tsx`
- `SessionComposer.tsx`
- `WindowStrip.tsx` / `WindowTab.tsx`
- `PaneStrip.tsx` / `PaneTab.tsx`
- `TerminalToolbar.tsx`
- `InputRow.tsx`
- `TokenPanel.tsx`
- `ConfirmKill.tsx`
- `EmptyState.tsx`
- `NoticeBanner.tsx`
- `StatusChip.tsx`
- `Topbar.tsx`
- `FleetView.tsx` (orchestrates Fleet)
- `CockpitView.tsx` (orchestrates Cockpit)

### 7.2 State management

All state lives in `App` via `useState` hooks. This is manageable for the current size but makes adding features (theme, font size, search, command history) harder because they each require new state + prop drilling.

**Recommendation**: Keep the current pattern for now — a context-based refactor should be a separate effort. New features should add state as close to their component as possible (e.g., search state in TerminalToolbar).

### 7.3 CSS organization

Six separate CSS files with overlapping concerns (e.g., both `components.css` and `terminal.css` style `.window-strip` and `.pane-strip`). Responsive overrides are in a separate file but still reference the same selectors.

**Recommendation**: Don't restructure CSS unless rewriting components. The current organization is workable.

### 7.4 E2E test stability

14 Playwright tests cover the critical paths. They rely on:

- `_xtermInstance` exposed on the terminal element
- Mock API routes for all HTTP endpoints
- Specific DOM selectors (classes, roles, aria-labels)

Any redesign that changes DOM structure, CSS classes, or component structure will require corresponding test updates. The tests are thorough and should be preserved/updated rather than rewritten.

### 7.5 @wterm/dom

Listed in `package.json` dependencies but not imported anywhere in the current source. This may be a planned/wip web terminal wrapper. Check if it should be used or removed.

---

## 8. Web Research: Terminal-Native UI Best Practices

### 8.1 Key patterns from research

**Cockpit metaphor** (from Git Cockpit research, Reasonix dashboard):

- The browser is a "companion" to the terminal, not a mirror
- Use the browser for what terminals can't do: spatial layout, visual hierarchy, tooltips, drag-and-drop
- Don't slavishly recreate terminal aesthetics — use the terminal _inside_ the browser UI, not as the browser UI

**Terminal in browser anti-patterns** (from research):

- Full-monospace UI everywhere — reduces scanability and feels gimmicky
- Green-on-black phosphor aesthetic for product chrome — fatiguing for long sessions
- Decorative "terminal window" frames with fake title bars — adds no value

**Validated by current design**:

- tmuapp already follows the "cockpit" approach: sans-serif product chrome, monospace only for terminal content
- DESIGN.md's anti-slop rules align with research consensus
- Dark near-black surfaces are preferred for long coding sessions (less eye strain than pure black)

**Recommended additions** (from xterm.js ecosystem):

- `@xterm/addon-search` for Ctrl+F — standard in VS Code, Hyper, Tabby
- Dynamic `fontSize` — xterm.js supports `term.options.fontSize` setter
- Theme switching — xterm.js supports `term.options.theme` setter

### 8.2 Accessibility considerations

From Coder's web terminal docs and xterm.js docs:

- `screenReaderMode: true` is already enabled — good
- Terminal textarea for keyboard input — handled by xterm.js
- Focus management when switching panes — currently implemented
- ARIA roles on tabs — present but could be more robust

**Gap**: No visible focus indicator on the terminal container when xterm.js textarea is focused. The `.xterm.focus` outline is subtle (1px, offset -1px). Could be strengthened.

---

## 9. Implementation Risks

1. **Search addon integration**: `@xterm/addon-search` v4+ uses a different API than older versions. Need to check installed version compatibility. The search-bar UI addon (`xterm-addon-search-bar`) is a third-party package — evaluate stability before depending on it.

2. **Font resize ripple**: Changing `fontSize` changes cell metrics, which changes terminal fit, which triggers a tmux pane resize via API. This is a cascade of async operations that needs careful debouncing and error handling. The existing resize debounce (150ms) should be reused.

3. **Theme persistence**: xterm.js theme must be applied before `term.open()` or after via `term.options.theme = ...`. The latter requires xterm.js v5.3+. Need to verify version.

4. **Activity indicators on WebSocket**: Tracking per-pane output requires extending the stream message handler to record timestamps even for non-selected panes. Currently only the active pane's stream is open. This would require either: (a) monitoring all pane streams simultaneously (resource-heavy), or (b) inferring activity from HTTP capture timestamps during background refresh.

5. **Session reorder drag-and-drop**: Pure client-side reordering would conflict with server-side order on refresh unless persisted to localStorage. Server-side reordering requires a new API endpoint.

6. **E2E test breakage**: Any structural change to components (extracting from monolithic file, renaming CSS classes) will break test selectors. Tests use classes like `.terminal-toolbar`, `.window-strip`, `[data-session-card]` — these should be preserved or tests updated in lockstep.

7. **@wterm/dom dependency**: Listed but unused. If it's intended as a replacement terminal wrapper, it needs evaluation against the current `terminal-adapter.ts` pattern.

---

## 10. Summary of Recommended Changes (Prioritized)

### Critical (anti-slop violations)

1. Remove `linear-gradient` from `.window-strip::after` — replace with pure color or multiple `box-shadow` stops
2. Remove `backdrop-filter: blur(10px)` from `.topbar` — use fully opaque background

### High priority (missing terminal-native features)

3. Add `@xterm/addon-search` + search bar in terminal toolbar
4. Add font size +/- controls with keyboard shortcuts (Ctrl+=, Ctrl+-, Ctrl+0)
5. Add terminal theme picker with 4-5 presets + localStorage persistence

### Medium priority (UX improvements)

6. Add activity indicators on window/pane tabs (pulsing dot for recent output)
7. Add keyboard shortcut cheatsheet panel (triggered by `?`)
8. Add session reorder (client-side sort at minimum)
9. Add terminal resize handle (drag-to-resize divider)
10. Strengthen terminal focus indicator

### Low priority (polish)

11. Add command history to input row (localStorage, last N commands)
12. Add proper `<label htmlFor>` association for input row
13. Add auto-dismiss to notices with configurable timeout
14. Make notices fixed-position instead of absolute
15. Add tooltips to health indicator chip

### Structural (separate effort)

16. Extract monolithic `main.tsx` into `src/components/` directory
17. Evaluate `@wterm/dom` — remove if unused, adopt if viable
