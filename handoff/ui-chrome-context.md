# UI Chrome Context: Fleet & Cockpit Views

## Overview

Single-page React app with two views: **Fleet** (`overview` — session cards grid) and **Cockpit** (`manage` — terminal + chrome). All logic lives in a single `App` component at `apps/website/src/main.tsx` (~990 lines). Styles are plain CSS split across `apps/website/src/styles/`.

The app renders tmux session data, streams ANSI terminal output via `@wterm/dom`, and uses `@heroui/react` for 6 components: `Alert`, `Button`, `Card`, `Chip`, `Input`, `Spinner`. The rest is custom-styled.

**Critical constraint:** Terminal rendering backend (`@wterm/dom`) is OUT OF SCOPE. All findings below concern product chrome — everything _around_ the terminal.

---

## File Map

| File                                     | Purpose                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/website/src/main.tsx`              | Single React component: App + sub-components (SessionGrid, WindowStrip, TokenPanel, ConfirmWindowKill, etc.) |
| `apps/website/src/styles/tokens.css`     | CSS custom properties (colors, fonts)                                                                        |
| `apps/website/src/styles/base.css`       | Reset, focus-visible, skip-link                                                                              |
| `apps/website/src/styles/layout.css`     | `.app-shell` grid, topbar, overview, session-grid, notices                                                   |
| `apps/website/src/styles/components.css` | Floating panels, manager grid, window/pane strips, buttons, inputs, status chips                             |
| `apps/website/src/styles/terminal.css`   | Terminal shell, toolbar, input-row, wterm overrides                                                          |
| `apps/website/src/styles/responsive.css` | Breakpoints at 980px and 560px + reduced-motion                                                              |
| `apps/website/src/api/client.ts`         | API fetch helpers (unrelated to chrome)                                                                      |
| `apps/website/src/terminal/*.ts`         | Terminal fit, protocol, scroll (out of scope)                                                                |
| `DESIGN.md`                              | Linear-inspired marketing design system (reference only — product chrome diverges)                           |

---

## Area Analysis

### 1. Session Cards (Fleet View)

**Code:** `main.tsx:999-1058` (SessionGrid), `layout.css:68-98`, `layout.css:101-146`

**Current structure per card (top-to-bottom layout, 238px fixed height):**

1. Session name (bold 16px) + attached/detached chip
2. Stats row: `{n} windows`, `{m} panes`, active command — each in a pill
3. Working directory path (mono 12px)
4. Terminal preview pane (pre/code block, 5-line ANSI capture)

**Visual states:**

- Default: `background: var(--surface-1)`, `border: 1px solid var(--hairline)`
- Hover: `border-color: rgba(94, 106, 210, 0.58)`, `background: #121318` (hardcoded!), `transform: translateY(-1px)`
- Selected: identical to hover (visual ambiguity)
- Active/press: `transform: translateY(1px)`

**Identified anti-patterns:**

- **Hardcoded hover background `#121318`** — should be a surface token. Not in DESIGN.md palette, not a CSS variable.
- **Hardcoded preview background `#050506`** — close to `var(--canvas)` (#010102) but off by `#040404`. Breaks token consistency.
- **Hardcoded preview text color `#d8dee9`** — should use `var(--ink-muted)` (#d0d6e0) or similar token.
- **Hover and selected are visually identical.** No way to tell which card was last opened vs which card the cursor is over.
- **Fixed 238px height** — cards don't adapt to content. Long commands/paths truncate. At single-column mobile, 238px wastes vertical space with short content.
- **Card content uses a `<button>` element** — all text becomes button label. `aria-label` is correctly set, but browser/SR behavior for complex button content varies.
- **No loading skeleton per card** — text "Loading preview…" shown in mono font. No visual differentiator from actual terminal output.
- **`content-visibility: auto` with `contain-intrinsic-size: 238px`** — good for performance, but may cause layout shift on scroll if actual height differs.
- **Stats pills use `var(--surface-2)` background** — same as cards at different surface level. Low contrast between pill and card background.

**Suggested improvements:**

- Tokenize `#121318` as `--session-card-hover-bg` (derived from surface ladder)
- Differentiate selected state: stronger lavender border, subtle lavender-left-border accent, or background lift
- Consider variable-height cards (no `height: 238px`, let grid rows stretch via `grid-auto-rows`)
- Add skeleton/placeholder for loading preview state
- Consider card-level surface lift: unselected cards at surface-1, hovered at surface-2, selected at surface-2 with lavender accent

---

### 2. Window Strip (Tab Bar)

**Code:** `main.tsx:1119-1139` (WindowStrip), `components.css:60-66`, `terminal.css:46-50`

**Current structure:**

- Flex row, `height: 50px`, horizontal scroll, `background: var(--surface-1)`
- Each tab: `{index}:{name}` + pane count in `<small>`
- Selected: `border: rgba(94,106,210,0.55)`, `background: rgba(94,106,210,0.16)`
- Hover: `border-color: var(--hairline-strong)`, `background: var(--surface-2)`
- Tab width: `max-width: 220px`, flex `0 0 auto`

**ARIA implementation:**

- Container: `role="tablist"`, `aria-label="Windows"` ✓
- Tabs: `id={windowTabId(id)}` ✓
- **MISSING:** `role="tab"`, `aria-selected`, `aria-controls`, `tabindex` management — not a functional tablist for screen readers

**Identified anti-patterns:**

- **Incomplete ARIA tab pattern.** No `aria-selected` means SR users can't know which tab is active. No `aria-controls` links to terminal panel.
- **Hardcoded rgba values** for selected state (primary at 0.55/0.16 opacity) — no CSS variable.
- **No visual indication of active window** (tmux concept of "active window" vs "selected window" for viewing). The currently-viewed window might not be the active one in tmux.
- **No scroll overflow indicators.** Long window lists scroll horizontally without visual fade/shadow at edges.
- **Tabs have no bottom-border indicator** for selected state — only background/border tint. A 2px bottom accent bar would provide a stronger position cue.
- **Tab `id` generated by `windowTabId()` but not referenced anywhere** — the function exists but the id is unused (no `aria-labelledby` on panel).

**Suggested improvements:**

- Complete the ARIA tablist pattern: `role="tab"`, `aria-selected={true|false}`, `tabindex={selected ? 0 : -1}`, `aria-controls="terminal-panel"`
- Add `--tab-selected-border: rgba(94,106,210,0.55)` and `--tab-selected-bg: rgba(94,106,210,0.16)` tokens
- Add 2px bottom accent bar on selected tab
- Add gradient fade at scroll boundaries when content overflows
- Show active-window indicator (small dot or different border treatment for the tmux-active window)

---

### 3. Pane Strip

**Code:** `main.tsx:952-971`, `components.css:67-89`

**Current structure:**

- Appears only when `panes.length > 1`
- Flex row, `padding: 8px 14px`, `border-top: 1px solid var(--hairline)`, `background: var(--surface-1)`
- Tab: `min-height: 30px`, `border-radius: 6px`, `font-size: 12px`, shows pane title or command
- Selected: same lavender tint pattern as window tabs

**Identified anti-patterns:**

- **Same incomplete ARIA pattern** as window strip — no `role="tab"`, no `aria-selected`
- **Disappears for single-pane windows** — pane info only visible in toolbar. The strip popping in/out when panes are added/removed causes layout shift.
- **Tabs use pane title/command** — could be identical across panes (e.g., both running "bash"). User can't distinguish panes without manually renaming them in tmux.
- **Pane index not shown** — unlike window tabs that show `{index}:{name}`, pane tabs don't show index number.
- **No resize handle visual** — tmux pane splits are resizable, but the UI gives no indication of split ratios.

**Suggested improvements:**

- Show pane index prefix: `{index}:{title}`
- Keep strip visible even for single panes (or provide an always-visible indicator)
- Add ARIA tablist pattern
- Consider visual grouping: panes within the same tmux layout split could be visually grouped

---

### 4. Terminal Toolbar

**Code:** `main.tsx:869-905`, `terminal.css:1-45`

**Current structure:**

- Flex row, `min-height: 42px`, `background: var(--surface-2)`
- Left: pane title/command as heading + dimensions (`{w}x{h}`) + current path
- Right: Split H, Split V (ghost buttons), Kill Window (danger button)

**Identified anti-patterns:**

- **Kill Window at same prominence as split operations.** Accidental activation risk. Danger action should be visually separated or icon-only.
- **No "New Window" action** in toolbar — only available globally via session-creation flow. Contrasts with tmux's native `prefix + c`.
- **Toolbar collapses strangely at 980px** breakpoint: switches to `flex-direction: column`, `align-items: start`. Info stacks above actions with no visual grouping.
- **No visual separator** between info section and actions section — just gap.
- **The dimensions display** (`{w}x{h}`) is useful for power users but could show pane index and active status.
- **Terminal heading uses pane title** — falls back to `currentCommand`, then "No pane selected". Empty state string doesn't match how the terminal actually renders (which shows "No tmux pane selected…" text).

**Suggested improvements:**

- Add visual separator (1px vertical hairline) between info and actions
- Move Kill Window farther right or into a secondary/overflow menu
- Add "New Window" button
- Show pane index in heading: `{index}:{title}`
- At responsive breakpoint, keep toolbar compact rather than stacking

---

### 5. Input Row

**Code:** `main.tsx:910-946`, `terminal.css:89-120`

**Current structure:**

- Flex row, `padding: 9px 10px`, `border-top: 1px solid var(--hairline)`, `background: var(--surface-1)`
- Label "Send command to active pane" (hidden below 980px)
- Text input (HeroUI Input), Run button (primary), Enter button (ghost), optional pane count pill
- Form onSubmit sends input + Enter key to pane API

**Identified anti-patterns:**

- **"Enter" button is misleading.** Form already sends Enter on submit. Users may be confused about when to click "Enter" vs "Run" or press keyboard Enter. The two-buttons-for-one-action pattern is redundant.
- **Tab key hijacking** (`onKeyDown` for Tab → `sendInputKey("Tab")`) prevents keyboard navigation away from the input field. This is an **accessibility blocker**: users can't Tab to the Run button or other controls.
- **Label disappears at 980px** with `display: none` — input loses its accessible name on smaller viewports. The `aria-label="Pane input"` on the Input component mitigates this partially, but the visual label should still be present.
- **Pane count pill in input row** duplicates information from the pane strip. Unnecessary visual noise.
- **Input at bottom of screen** creates a visual "dead zone" — the terminal flow stops at the input bar with no soft transition. A subtle gradient or 1px highlight on the top edge of the input row would integrate it better.
- **`border-top: 1px solid var(--hairline)`** is the same treatment as the pane-strip border. These two surfaces should feel different (toolbar vs pane navigator).
- **Run button disabled state** (`isDisabled` when no pane or empty input) shows HeroUI's disabled styling which overrides with `[data-disabled="true"]` selectors in `components.css:124-131`.

**Suggested improvements:**

- Remove "Enter" button — single "Run" button with keyboard Enter is simpler
- Fix Tab key hijacking: only intercept Tab when modifier keys are held, or provide an explicit "Send Tab" button/icon
- Keep label visible at all breakpoints (or use placeholder text as fallback)
- Remove pane-count pill from input row (or move it to toolbar if needed)
- Add subtle gradient top-edge on input row to visually blend with terminal

---

### 6. Topbar

**Code:** `main.tsx:737-783`, `layout.css:32-49`

**Current structure:**

- Sticky top bar, `height: 64px`, `background: rgba(1,1,2,0.96)` with `backdrop-filter: blur(10px)`
- Left: brand (`tm` monogram + "tmuapp" + "tmux fleet control")
- Center (manage view): Back button + session name + window/pane stats + attached chip
- Right: status chip, refresh button, Token button, New Session button

**Identified anti-patterns:**

- **Refresh button uses letter "R"** as icon — no SVG icon, no meaningful visual. Poor affordance.
- **Hardcoded background `rgba(1, 1, 2, 0.96)`** — should reference `var(--canvas)` with opacity, or have a dedicated `--topbar-bg` token.
- **Session context line grows long** — name + stats + chip at 980px wrap to a new row below actions, creating a 3-row topbar at narrow widths. Layout becomes chaotic.
- **No breadcrumb or path indicator** — only "Back" button to return to Fleet. No indication of current view depth.
- **Brand mark (34x34px)** is small relative to the 64px bar height. The primary brand element feels cramped.
- **"tmux fleet control" subtitle** is `color: var(--ink-subtle)` with no explicit font size — inherits 14px from body.
- **Session context stats span** at 13px — text may overflow on long session names.

**Suggested improvements:**

- Replace "R" with actual refresh icon (HeroUI might provide one, or use an SVG)
- Tokenize topbar background
- Collapse session context into a compact breadcrumb at narrow widths
- Increase brand mark to 38px (better proportion in 64px bar)

---

### 7. Modal Dialogs

**Code:** `main.tsx:1155-1203` (TokenPanel), `main.tsx:1208-1247` (ConfirmWindowKill), `components.css:1-39`

**Token Panel:**

- Floating overlay + card with form
- Shows "API Token" heading, description, password input, Cancel/Save buttons
- Focus trap via `useFocusTrap` hook
- Escape key dismisses
- Click-outside dismisses

**Confirm Kill Window:**

- Same overlay pattern
- Danger-themed border
- Shows window name, Cancel/Kill buttons

**Identified anti-patterns:**

- **Click-outside dismisses without confirmation** — if user has typed a token, clicking outside loses it silently. No unsaved-changes guard.
- **No open/close animation** — modals appear/disappear instantly. Feels jarring compared to the otherwise polished dark theme.
- **Backdrop at 62% opacity** (`rgba(1,1,2,0.62)`) — fairly transparent. Could be more opaque to focus attention.
- **Hardcoded `rgba(1,1,2,0.62)`** — should be a token.
- **Confirm Kill doesn't state consequences** — no mention of irreversible nature, number of panes being killed, or attached clients.
- **Token panel uses `type="password"`** but no show/hide toggle.
- **`panel-card` background is `var(--surface-2)`** — one level above surface-1. Modals could lift higher in the surface hierarchy for stronger visual depth.
- **No `aria-description` or `aria-describedby`** on dialogs to describe the action more fully.

**Suggested improvements:**

- Add enter/exit transitions (opacity + scale, ~200ms)
- Use surface-3 or surface-4 for modal cards for stronger lift
- Token panel: add show/hide toggle, unsaved-changes warning on click-outside
- Confirm Kill: state pane count, show "This action cannot be undone"
- Tokenize backdrop color

---

### 8. Responsive Behavior

**Code:** `responsive.css:1-115`

**Current breakpoints:**

- `max-width: 980px` — topbar wraps, composer 2-col, terminal toolbar stacks, manager min-term-height, session-context reorders, input label hides
- `max-width: 560px` — single column everywhere, actions fill width, grid 1-col, composer 1-col, terminal gets min-height, input-row wraps, notices go static, panel buttons go full-width

**Identified anti-patterns:**

- **Only 2 breakpoints** — nothing between 560px and 980px. Tablet (768px iPad) falls into the 980px bucket, getting the same layout as phones in landscape. iPad portrait (768px) gets multi-col layouts that may be cramped.
- **No mobile-first design.** All base styles are desktop-first with max-width overrides.
- **`minmax(60svh, 1fr)` for terminal** at 980px — forces terminal to minimum 60% viewport height. On short screens this gives no room to chrome.
- **Session context `order: 3`** at 980px — pushes context below actions, making it feel disconnected from the back button.
- **No touch-specific enhancements** — hover states that trigger meaningful changes (card lift, button color change) don't degrade gracefully on touch. No `@media (hover: hover)` guards.
- **Input-row wraps at 560px** — label disappears, input takes full width. Run/Enter buttons wrap onto second row. Poor space utilization.

**Suggested improvements:**

- Add 768px breakpoint for tablet-optimized layout
- Use mobile-first approach or at least add `@media (hover: hover)` guards for hover effects
- At 980px, keep session context inline with actions (don't reorder below)
- Consider compact card variant (< 300px minimum) for narrow grids

---

### 9. CSS Token Usage Audit

**Tokens properly defined** in `tokens.css:1-45`:

- `--primary`, `--primary-hover`, `--primary-focus`
- `--ink`, `--ink-muted`, `--ink-subtle`, `--ink-tertiary`
- `--canvas`, `--surface-1` through `--surface-4`
- `--hairline`, `--hairline-strong`, `--hairline-tertiary`
- `--danger`, `--danger-bg`, `--success`, `--success-bg`, `--warning`, `--warning-bg`
- `--font`, `--mono`

**Tokens well-used for:** most backgrounds, text colors, borders in layout.css

**Hardcoded colors needing tokenization** (grouped by type):

**Backgrounds (6 instances):**
| Location | Value | Should be |
|----------|-------|-----------|
| `layout.css:84` — session-card hover bg | `#121318` | `--surface-2` or new `--card-hover-bg` |
| `layout.css:145` — session-preview bg | `#050506` | `--canvas` or dedicated `--preview-bg` |
| `layout.css:190` — notice.danger bg | `#1a1112` | tokenize as `--danger-surface` |
| `terminal.css:28` — terminal loading overlay | `rgba(15,16,17,0.85)` | `--surface-1` with opacity token |
| `layout.css:36` — topbar bg | `rgba(1,1,2,0.96)` | `--canvas` with opacity token |

**Text colors (4 instances):**
| Location | Value | Should be |
|----------|-------|-----------|
| `layout.css:146` — preview text | `#d8dee9` | `--ink-muted` |
| `components.css:52` — danger hover text | `#ff8a8a` | tokenize as `--danger-text` |
| `tokens.css` status colors | `#ffb8b8`, `#c8f7d2`, `#ffe2a8` | define as status tokens |

**Border/opacity values (15+ instances):**
| Location | Value | Should be |
|----------|-------|-----------|
| `components.css:83` — card hover border | `rgba(94,106,210,0.58)` | `--primary-dim` |
| `components.css:66` — window-tab selected border | `rgba(94,106,210,0.55)` | `--primary-dim` |
| `components.css:86` — pane-tab selected border | `rgba(94,106,210,0.55)` | `--primary-dim` |
| `components.css:67` — window-tab selected bg | `rgba(94,106,210,0.16)` | `--primary-subtle` |
| `components.css:87` — pane-tab selected bg | `rgba(94,106,210,0.16)` | `--primary-subtle` |
| `components.css:49` — danger hover bg/border | `rgba(255,107,107,0.1/0.62)` | `--danger-hover-bg` / `--danger-hover-border` |
| `components.css:54-55` — danger default | `rgba(255,107,107,0.08/0.42)` | `--danger-dim-bg` / `--danger-dim-border` |
| `components.css:29` — confirm panel border | `rgba(255,107,107,0.38)` | reuse danger tokens |
| `layout.css:35` — terminal focus outline | `rgba(94,106,210,0.45)` | `--primary-focus-ring` |
| `components.css:118` — input focus border | `rgba(130,143,255,0.66)` | `--primary-focus-border` |
| `components.css:120` — input focus shadow | `rgba(94,106,210,0.22)` | `--primary-focus-shadow` |

**Solid colors (3 instances):**
| Location | Value | Should be |
|----------|-------|-----------|
| `tokens.css` + components | `#fff` | define `--white` or `--on-primary` |
| status success bg opacity | `rgba(39,166,68,0.18)` | already `--success-bg` ✓ |
| status warning bg opacity | `rgba(217,154,43,0.16)` | already `--warning-bg` ✓ |

**Summary:** Roughly 25+ hardcoded color values across the CSS. Every repeated `rgba(94,106,210,X)` chain should collapse into `--primary-dim`, `--primary-subtle`, `--primary-focus-ring`, etc. Danger colors need the same treatment. This is the single biggest engineering debt in the stylesheet — any primary/danger color change requires finding 15+ manual rgba values.

---

### 10. Accessibility

**Code:** `base.css` (focus-visible, skip-link), scattered throughout `main.tsx`

**What's done well:**

- Skip link present with `#main-content` target ✓
- Modal focus trap implemented (`useFocusTrap`) ✓
- Escape-to-dismiss on modals ✓
- `role="alert"` with `aria-live="assertive"` on notices ✓
- `role="status"` with `aria-live="polite"` on loading states ✓
- `aria-label` on most interactive elements ✓
- `:focus-visible` outline defined (2px lavender at 80% opacity) ✓
- `prefers-reduced-motion` respected (disables animations, transforms, spinners) ✓
- `<html lang="en">` ✓
- Semantic elements: `<header>`, `<main>`, `<nav>`, `<section>` ✓

**Identified issues:**

**Critical:**

1. **Tab key hijacking in input row** (`main.tsx:928-933`): `onKeyDown` for Tab calls `sendInputKey("Tab")` and `event.preventDefault()`. This traps keyboard focus in the input — users cannot Tab to the Run button or any other control. Must be fixed: either only intercept Tab with a modifier, or provide an alternate key binding.

2. **Incomplete ARIA tablist pattern** for window tabs and pane tabs: missing `role="tab"`, `aria-selected`, `aria-controls`, `tabindex` management. Screen readers cannot identify these as tabs or know which is selected.

**Medium:** 3. **Label removal at 980px** (`responsive.css:49`): `.input-label { display: none }` removes the visual label "Send command to active pane". Only mitigated by `aria-label="Pane input"` on the Input component.

4. **Refresh button has no visual label**: shows "R" character only. `aria-label="Refresh sessions"` is set but sighted keyboard users see only "R".

5. **Session cards as complex `<button>`**: the `aria-label` covers the content but the button pattern for such complex content (preview, stats, path) is unusual. A card with a single "Open" action might be more conventional.

6. **No `aria-expanded` on toggle buttons**: Token button, New Session form toggle, and Kill Window action don't indicate expanded state.

**Minor:** 7. **No `:focus` fallback** — only `:focus-visible` is styled. Older browsers that don't support `:focus-visible` get no focus indicator. 8. **No `aria-describedby`** on inputs for help text (session composer copy text, token panel description). 9. **No high-contrast mode media query** (`@media (forced-colors: active)`).

---

## Dependencies & Constraints

- **HeroUI React** (`@heroui/react`): Provides Alert, Button, Card, Chip, Input, Spinner. These components inject their own DOM structure (e.g., `[data-slot="input-wrapper"]`) that CSS must target via attribute selectors. Overrides in `components.css:112-131` target HeroUI internals.
- **WTerm** (`@wterm/dom`): Renders ANSI terminal in a `<div>`. Injects its own DOM with `.term-row`, `.term-cursor` classes. Terminal is out of scope but chrome must not interfere.
- **No CSS-in-JS** — all styles are plain `.css` files in `styles/`.
- **No design system library** — no Tailwind, no Stitches, no Panda. Hardcoded CSS values are the norm.
- **Single-component architecture** — all UI logic is in one `App` function. Sub-components are functions, not separate files. Refactoring means careful extraction.

## Risk Areas

1. **Extracting sub-components** to separate files could break the tightly-coupled state management (all state lives in App's `useState` hooks).
2. **Adding CSS tokens** for all hardcoded values requires coordinated changes across 5 CSS files.
3. **Fixing Tab key hijacking** may require architectural changes to how terminal input vs UI navigation is handled (two competing uses for Tab).
4. **Any changes to the grid layout** (`app-shell`, `manager-body`, `terminal-shell`) must be tested at both breakpoints AND with the terminal fit code (which measures available space).
