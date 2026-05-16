# Chrome Refinement Handoff

## Changed Files

| File                                     | What changed                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/src/styles/tokens.css`     | Removed `--card-hover-bg`; added `--skeleton-shine` + `--primary-focus-outline`                                                                                                                    |
| `apps/website/src/styles/layout.css`     | Skeleton animation, notice slide-in, surface-2 for card hover, surface-3 for stats pills, hairline-strong composer border, composer-copy vertical breathing, heading weight 700, empty-state depth |
| `apps/website/src/styles/components.css` | Panel card → surface-3 for stronger modal depth                                                                                                                                                    |
| `apps/website/src/styles/terminal.css`   | Terminal-wrap inset shadow for recessed feel; status chip transitions                                                                                                                              |
| `apps/website/src/styles/base.css`       | Focus-visible outline tokenized + transition                                                                                                                                                       |

## What Was Implemented

### Phase 1: Loading Skeletons

- `@keyframes skeleton-pulse` added — subtle opacity pulse (0.3 ↔ 0.6)
- `.session-preview.loading` uses the animation + transparent text + surface-2 background + `user-select: none`
- Respects `prefers-reduced-motion` (existing `animation-duration: 1ms !important` override handles it)

### Phase 2: Surface Token Derivation

- `--card-hover-bg` removed — session card hover/selected now uses `var(--surface-2)` directly
- Session stats pills now use `var(--surface-3)` for contrast against cards at rest/hover
- Panel card (modals) now uses `var(--surface-3)` for stronger elevation from surface-2 panels
- This eliminates the only surface-level absolute hex value that was used across multiple selectors

### Phase 3: Micro-Interactions

- **Notice banner**: slides in from right (`@keyframes notice-slide-in`, 300ms ease-out)
- **Status chips**: 200ms transitions on border-color, background-color, color
- **Focus ring**: 150ms transition on outline-color and outline-offset
- **Skeleton pulse**: 1.5s infinite ease-in-out

### Phase 4: Visual Rhythm

- Session stats pills: `var(--surface-3)` background (was surface-2, now distinct from hover state)
- Empty state: added `box-shadow: 0 0 0 1px var(--hairline)` for subtle depth
- Session composer: `var(--hairline-strong)` border (was hairline) for better visual weight
- Composer copy: padding changed from `padding-bottom: 4px` to `padding: 4px 0` for symmetrical breathing
- Overview heading: `font-weight: 700` (was 650) for stronger hierarchy

### Phase 5: Dark Theme Depth

- Terminal wrap: `box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3)` for recessed terminal feel
- Surface stack verified correct: toolbar (surface-2) → viewport (canvas/black) → input (surface-1)

### Bonus: One-Off Color Elimination

- Button focus-visible outline: `rgba(94, 106, 210, 0.8)` → `var(--primary-focus-outline)` (new semantic token)

## Validation

```
vp check --fix  → pass (no warnings, lint errors, or type errors in 19 files)
vp run website#e2e → 17 passed (14.7s)
```

## Commands Run

- `vp check --fix` — formatting + lint + type-check, all clean
- `vp run website#e2e` — all 17 Chromium e2e tests pass

## Surprises

None. All changes were mechanical CSS token substitutions and animation additions.

## Remaining Work

- Keyboard shortcut system for window/pane switching (Cmd+1-9, Cmd+Shift+Arrow) — needs main.tsx changes
- Kitty graphics protocol via `@xterm/addon-image` — separate package install + terminal-adapter change
