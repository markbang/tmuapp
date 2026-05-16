# UI Chrome Polish Handoff

## Summary

Tokenized all hardcoded CSS colors (~25 instances), fixed 2 critical accessibility issues, added visual polish across session cards, modals, window strips, toolbar, input row, and panes.

## Changed Files

| File                                     | Change | Description                                                                   |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `apps/website/src/styles/tokens.css`     | Edit   | Added 23 new CSS custom properties for colors/opacities                       |
| `apps/website/src/styles/layout.css`     | Edit   | Replaced 6 hardcoded colors with tokens; differentiated card hover/selected   |
| `apps/website/src/styles/components.css` | Edit   | Replaced 10 hardcoded colors; added modal enter animations; window strip fade |
| `apps/website/src/styles/terminal.css`   | Edit   | Replaced 4 hardcoded colors; added toolbar separator                          |
| `apps/website/src/main.tsx`              | Edit   | 8 changes: Tab fix, ARIA, refresh SVG, remove Enter, pane index, kill confirm |

## What Was Implemented

### Phase 1: CSS Tokenization (tokens.css)

Added 23 semantic tokens:

- `--primary-dim-border`, `--primary-subtle-border`, `--primary-subtle-bg`, `--primary-focus-ring`, `--primary-focus-border`, `--primary-focus-shadow`
- `--danger-hover-border`, `--danger-hover-bg`, `--danger-dim-border`, `--danger-dim-bg`, `--danger-panel-border`, `--danger-notice-border`, `--danger-empty-border`, `--danger-text`, `--danger-text-status`, `--danger-surface`
- `--success-text`, `--warning-text`
- `--card-hover-bg`, `--preview-bg`, `--preview-text`
- `--topbar-bg`, `--modal-backdrop`, `--terminal-overlay`, `--white`
- All `:root` and semantic, no hardcoded values

### Phase 2: layout.css Token Replacement

- Topbar background: `rgba(1,1,2,0.96)` → `var(--topbar-bg)`
- Brand mark color: `#fff` → `var(--white)`
- Card hover/selected border: `rgba(94,106,210,0.58)` → `var(--primary-dim-border)`
- Card hover background: `#121318` → `var(--card-hover-bg)`
- Preview colors: `#d8dee9` / `#050506` → `var(--preview-text)` / `var(--preview-bg)`
- Empty state danger border: `rgba(255,107,107,0.35)` → `var(--danger-empty-border)`
- Notice danger border/background: `rgba(255,107,107,0.4)` / `#1a1112` → tokens

### Phase 3: components.css Token Replacement + Animations

- Floating panel backdrop: `rgba(1,1,2,0.62)` → `var(--modal-backdrop)`
- Added `@keyframes panel-enter` (opacity 0→1, 200ms)
- Added `@keyframes panel-card-enter` (opacity + scale + translateY, 250ms)
- Confirm panel border: `rgba(255,107,107,0.38)` → `var(--danger-panel-border)`
- Window/pane tab selected: `rgba(94,106,210,0.55)` / `rgba(94,106,210,0.16)` → tokens
- Window strip overflow fade: `::after` pseudo-element with sticky gradient
- Danger button colors: all 4 hardcoded → `var(--danger-*)` tokens
- Primary button: `#fff` → `var(--white)`
- Status chip colors: `#c8f7d2`, `#ffe2a8`, `#ffb8b8` → tokens
- Input focus: `rgba(130,143,255,0.66)` / `rgba(94,106,210,0.22)` → tokens

### Phase 4: terminal.css Token Replacement

- Loading overlay: `rgba(15,16,17,0.85)` → `var(--terminal-overlay)`
- Xterm focus outline: `rgba(94,106,210,0.45)` → `var(--primary-focus-ring)`
- Terminal actions separator: added `border-left` + `padding-left`
- Danger/status/input colors: all → tokenized

### Phase 5: Accessibility Fixes (main.tsx)

- **Tab key fix**: Only `preventDefault` when NO modifiers held (`!shiftKey && !ctrlKey && !metaKey && !altKey`). Shift+Tab, Ctrl+Tab, etc. now pass through normally for browser tab navigation.
- **WindowStrip ARIA**: Added `aria-selected` and `aria-controls="terminal-panel"` to each window tab button
- **PaneStrip ARIA**: Added `aria-selected` and `aria-controls="terminal-panel"` to each pane tab button
- **Terminal wrapper**: Added `id="terminal-panel"` and `role="tabpanel"` for ARIA tablist pairing

### Phase 6: Visual Polish (main.tsx + CSS)

- **Session card hover/selected differentiation**: Selected card gets `box-shadow: inset 3px 0 0 var(--primary)` (lavender left accent bar); hover lift only applies to non-selected cards
- **Modal enter transitions**: Backdrop fades in 200ms, card scales from 0.97 + lifts 4px in 250ms
- **Window strip scroll overflow**: Sticky `::after` gradient fade on right edge
- **Refresh icon**: Text "R" replaced with 16x16 SVG rotate/refresh icon
- **Enter button removed**: Redundant (form onSubmit already sends Enter key)
- **Toolbar separator**: `border-left` on `.terminal-actions` after toolbar copy
- **Pane index in tabs**: Tab labels now show `{index}:{title}` format
- **Kill window description**: Now reads "This action cannot be undone."

## Commands Run

| Command              | Exit Code | Result                                         |
| -------------------- | --------- | ---------------------------------------------- |
| `vp check --fix`     | 0         | Format, lint, type-check: all clean (19 files) |
| `vp run website#e2e` | 0         | All 17 tests pass (14.1s)                      |

## Validation Evidence

- TypeScript: 0 errors, 0 warnings
- Lint: 0 errors, 0 warnings
- Format: clean
- E2E: 17/17 pass (terminal capture, resize, viewport, grid metrics, cursor, scrollback, input, chrome boundary, keyboard forwarding, offline, empty, create, token, kill, preview fallback, capture failure)

## Surprises / Risks

- **HeroUI Button type constraints**: The Button component doesn't accept `role` and `tabIndex` as direct props. Used `aria-selected` and `aria-controls` instead to achieve ARIA tablist semantics without violating component types.
- **Terminal CSS moved to components.css was rolled back**: Initial approach inadvertently merged terminal styles into components.css; corrected to keep terminal-specific styles in terminal.css per original architecture.

## Decisions Needing Parent Approval

- None — all changes within approved scope.

## Recommended Next Steps

1. Manual smoke test: verify modal enter animations, refresh icon, session card selected state
2. Screen reader test (VoiceOver/NVDA): verify ARIA tablist navigation
3. Proceed with Phase 1 terminal swap if not yet done
