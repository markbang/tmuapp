# Meta-Prompt: UI Chrome Improvement — Fleet & Cockpit Views

## Goal

Produce a concrete, prioritized implementation plan for UI/UX improvements to the product chrome (everything outside the terminal rendering area) in the Fleet (overview) and Cockpit (manage) views. The plan must be actionable by a subagent — specific files, specific line ranges, specific CSS rule sets.

**Do NOT change:**

- Terminal rendering backend (`@wterm/dom`, `terminal/*.ts` files)
- API client or data-fetching logic
- Tmux protocol, WebSocket management, or resize logic
- The terminal element's internal grid/row/col behavior

## Context/Evidence

All findings are documented in detail in `handoff/ui-chrome-context.md`. Key sources:

| File                                     | Lines | Content                                         |
| ---------------------------------------- | ----- | ----------------------------------------------- |
| `apps/website/src/main.tsx`              | 1-990 | All React components and state                  |
| `apps/website/src/styles/tokens.css`     | 1-45  | CSS custom properties                           |
| `apps/website/src/styles/base.css`       | 1-52  | Reset, focus-visible, skip-link                 |
| `apps/website/src/styles/layout.css`     | 1-197 | Shell, topbar, overview, session grid, notices  |
| `apps/website/src/styles/components.css` | 1-133 | Panels, manager, strips, buttons, inputs, chips |
| `apps/website/src/styles/terminal.css`   | 1-120 | Terminal shell, toolbar, input-row              |
| `apps/website/src/styles/responsive.css` | 1-115 | Breakpoints, reduced-motion                     |
| `DESIGN.md`                              | 1-350 | Reference design system (Linear-inspired)       |

## Success Criteria

The plan must identify for each of the 10 areas:

1. **What to change** — specific CSS properties, DOM structures, or component patterns
2. **Why** — the anti-pattern or missed opportunity being addressed
3. **File + approximate line range** — where the change goes
4. **Priority** — Critical / High / Medium / Low
5. **Risk level** — risk of breaking terminal rendering, layout, or accessibility

Priorities are:

- **Critical**: accessibility blockers (Tab key trap), data loss risks
- **High**: hardcoded color tokenization, missing ARIA patterns, user confusion
- **Medium**: visual polish, hover/selected state differentiation
- **Low**: nice-to-have enhancements, animation polish

## Hard Constraints

1. **Do NOT edit** any file in `apps/website/src/terminal/` — these are out of scope.
2. **Do NOT change** the terminal element's CSS grid, cell measurement, or resize behavior.
3. **Do NOT remove** the focus trap implementation — it's correct.
4. **Do NOT change** the API client or data flow — only chrome UI.
5. **Do NOT introduce** a CSS framework or build-time CSS-in-JS — the project uses plain CSS files.
6. **Do NOT change** the DESIGN.md — it's a reference, not the implementation spec.
7. **Preserve** the `prefers-reduced-motion` media query behavior.
8. **Preserve** the skip-link functionality.

## Suggested Approach

1. **CSS token audit first**: Catalog all hardcoded colors from `ui-chrome-context.md` section 9, define missing tokens in `tokens.css`, then replace hardcoded values across all CSS files. This is the highest-leverage change — it de-risks all subsequent visual changes.

2. **Accessibility fixes**: Fix the Tab key trap in input-row (critical), complete ARIA tablist patterns for window/pane strips (high), add visual labels where missing.

3. **Session card hierarchy**: Differentiate hover vs selected states, tokenize hardcoded colors, consider variable-height cards.

4. **Window/pane strips**: Add scroll overflow indicators, complete ARIA patterns, visual polish for selected states.

5. **Topbar & toolbar**: Replace "R" with icon, fix responsive reordering, add visual separation.

6. **Modal polish**: Add transitions, unsaved-changes guard for token panel, strengthen confirm messaging.

7. **Responsive**: Add 768px breakpoint, `@media (hover: hover)` guards for hover states on touch devices.

## Validation

To validate the plan before implementation:

1. **Run existing tests**: `vp run website#e2e` — all 14 e2e tests must continue to pass. These tests verify terminal rendering, input, resize, session cards, modals, and offline states.
2. **Manual checklist** (can't be automated without visual testing):
   - Tab through the input row — must be able to reach the Run button
   - Navigate window tabs with keyboard — must have clear focus indication
   - Open Token panel, type something, click outside — note behavior
   - Resize browser through 980px and 560px breakpoints — no layout breakage
   - Test at 768px (iPad portrait) — all chrome visible and usable
3. **CSS token grep**: After tokenization, `grep -n '#[0-9a-fA-F]\{3,6\}' apps/website/src/styles/*.css | grep -v 'tokens.css'` should return only intentional hardcoded values (should not exist, or should be documented exceptions).

## Stop/Escalation Rules

- If changing a CSS rule breaks the terminal fit (terminal doesn't fill viewport, scrollbar appears), STOP and escalate. The `.terminal-shell`/`.manager-body` grid is fragile.
- If the Tab key trap fix introduces a regression where Tab no longer reaches the tmux pane, STOP and escalate.
- If HeroUI component overrides break HeroUI's internal state (focus management, disabled states), STOP.
- If you discover additional hardcoded colors beyond what's catalogued, add them to the plan before implementing.

## Resolved Questions & Assumptions

1. **Is HeroUI being actively used beyond the 6 imported components?** — Checked: only Alert, Button, Card, Chip, Input, Spinner. No ThemeProvider or custom theme configuration exists.
2. **Are there any dark/light mode concerns?** — The app is hardcoded dark-only (`color-scheme: dark` in tokens.css). No light mode support needed.
3. **Can we replace the R icon with an SVG?** — The project has `public/icons.svg` with SVG symbols, but no refresh icon exists. We can add one or use a Unicode character (↻/⟳) as an interim step.
4. **Is the `session-card` `<button>` pattern mandatory?** — It's a quick navigation pattern. Converting to `<Card>` + single `<Button>` would be more conventional but changes interaction model. Flag for discussion — not a blocker.
5. **What is the `input-row` Tab behavior actually supposed to do?** — It sends a literal Tab character to the tmux pane (for shell completion). But this should not prevent keyboard navigation. Solution: only intercept Tab when the input is focused AND has content (or use Ctrl+Tab for UI navigation).
