# Visual Design Review — tmuapp Web Terminal UI

## Scope

Reviewed the current web terminal UI against `apps/website/src/design/README.md`, the current React/CSS implementation, and the terminal-native UX research notes. The review focuses on the two sanctioned product surfaces:

- **Fleet** — tmux session overview.
- **Cockpit** — active session/window/pane manager with terminal as primary surface.

Primary implementation files reviewed:

- `apps/website/src/main.tsx`
- `apps/website/src/styles/tokens.css`
- `apps/website/src/styles/base.css`
- `apps/website/src/styles/layout.css`
- `apps/website/src/styles/components.css`
- `apps/website/src/styles/terminal.css`
- `apps/website/src/styles/responsive.css`
- `apps/website/src/terminal/terminal-adapter.ts`
- `handoff/refactor/web-redesign-context.md`
- `handoff/refactor/native-terminal-ux-research.md`

Note: requested `context.md` and `plan.md` were not present in the repository root during this pass.

---

## 1. Current visual state assessment

### What works

1. **The baseline product posture is right.**
   - The app already reads as a near-black tmux cockpit rather than a generic SaaS dashboard.
   - Surfaces are disciplined: `--canvas`, `--surface-1`, `--surface-2`, `--surface-3`, and hairline borders provide a coherent hierarchy.
   - Product chrome uses sans-serif while terminal previews and terminal output remain monospace.

2. **The one-accent rule is mostly respected.**
   - Lavender `--primary` is used for selected state, focus, primary CTAs, terminal cursor, and selection feedback.
   - Danger/success/warning colors are mostly semantic rather than decorative.

3. **Cockpit prioritizes the terminal.**
   - The active terminal is the largest element in the manage view.
   - Window strip, toolbar, input row, and pane strip are compact and operational.
   - xterm.js WebGL/ligature/image addons provide the right technical foundation for native-feeling TUI rendering.

4. **Fleet session cards are dense and useful.**
   - Cards show session name, attached state, window/pane counts, command, path, and preview.
   - Preview fallback states are pragmatic and avoid fake data.

5. **Focus and accessibility foundations exist.**
   - `screenReaderMode` is enabled in xterm.js.
   - Global focus-visible styles exist.
   - Dialogs use `aria-modal`, `aria-labelledby`, and a local focus trap.
   - Tabs expose `role="tablist"` and `aria-selected`.

### What does not work yet

1. **The UI feels unfinished for a native terminal replacement.**
   - No terminal search.
   - No terminal font zoom controls.
   - No activity indicators for background windows/panes.
   - No shortcut discoverability.
   - Toolbar controls are text-heavy (`Split H`, `Split V`, `Kill Window`) and do not scan like a terminal cockpit.

2. **Cockpit currently lacks a strong terminal focus model.**
   - xterm focus is represented only by a subtle 1px outline inside the terminal.
   - There is no clear “keyboard is going to terminal” vs “keyboard is controlling chrome/search/input” state.
   - The input row competes visually with direct terminal input, and its purpose is not immediately obvious for native terminal users.

3. **The monolithic component blocks careful iteration.**
   - `main.tsx` contains app orchestration, all views, all panels, all tab components, terminal lifecycle, helpers, and shortcut handling.
   - Adding search/font/activity state in this file will increase prop/state coupling unless it is split first.

4. **Fleet and Cockpit visual density is uneven.**
   - Fleet cards are useful but somewhat tall and repetitive for users with many sessions.
   - Cockpit tab rows are compact, but inactive tabs lack useful status context.
   - Topbar takes 64px even though the key task in Cockpit is terminal work.

5. **Some existing polish conflicts with the design contract.**
   - A few decorative effects drift toward generic polished web UI rather than instrument-panel UI.
   - These are fixable without changing the overall visual direction.

---

## 2. DESIGN.md violations found

### High priority violations

1. **Decorative gradient in the window strip**
   - Location: `apps/website/src/styles/components.css`
   - Selector: `.window-strip::after`
   - Current: `background: linear-gradient(to right, transparent, var(--surface-1));`
   - Violates: “Avoid gradients as decoration.”
   - Fix: remove the pseudo-gradient. Prefer no fade, a solid end cap, or a right hairline boundary. If overflow affordance is needed, use a non-gradient solid separator and native horizontal scroll.

2. **Glassmorphism-like topbar blur**
   - Location: `apps/website/src/styles/layout.css`
   - Selector: `.topbar`
   - Current: `backdrop-filter: blur(10px);` with translucent `--topbar-bg`.
   - Violates: “Avoid glassmorphism.”
   - Fix: make `--topbar-bg` opaque or set `.topbar { background: var(--canvas); backdrop-filter: none; }`.

### Medium priority violations / borderline drift

3. **Decorative inner terminal shadow**
   - Location: `apps/website/src/styles/terminal.css`
   - Selector: `.terminal-wrap`
   - Current: `box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3);`
   - Issue: reads as decoration rather than an instrument hairline.
   - Fix: replace with `box-shadow: inset 0 0 0 1px var(--hairline);` or remove entirely because terminal already sits between toolbar/input hairlines.

4. **Large modal shadow and card entrance scale**
   - Location: `apps/website/src/styles/components.css`
   - Selectors: `.panel-card`, `@keyframes panel-card-enter`
   - Current: `box-shadow: 0 24px 80px rgba(...)` and `scale(0.97)` animation.
   - Issue: not severe, but closer to SaaS modal polish than black cockpit.
   - Fix: reduce to a tokenized border/hairline shadow or static surface. Keep motion minimal.

5. **Session card hover lift**
   - Location: `apps/website/src/styles/layout.css`
   - Selector: `.session-card:hover:not(.selected)`
   - Current: `transform: translateY(-1px);`
   - Issue: not a hard violation, but elevation is less terminal-native than precise border/contrast changes.
   - Fix: use border/background changes only, or keep the lift extremely subtle and disabled under reduced motion, which already exists.

6. **Non-token hardcoded terminal colors**
   - Locations:
     - `apps/website/src/styles/terminal.css`: `background: #010102`
     - `apps/website/src/terminal/terminal-adapter.ts`: hardcoded xterm theme hexes
   - Issue: DESIGN.md requires CSS variables for UI color. Terminal ANSI palette can remain explicit, but terminal background/foreground/cursor should be aligned with tokens.
   - Fix: expose a terminal theme object from `terminal-adapter.ts` that mirrors `--canvas`, `--ink`, `--primary`, or document why ANSI palette remains code-level terminal config.

---

## 3. Missing native-terminal features

### 3.1 Terminal search bar

**Current state:** Not implemented. `@xterm/addon-search` is not in `apps/website/package.json`.

**Native convention:**

- macOS: `Cmd+F` opens search.
- Linux/Windows terminal convention: `Ctrl+Shift+F` avoids stealing terminal `Ctrl+F` from applications.
- Find next/previous commonly use `Cmd+G` / `Cmd+Shift+G` on macOS.

**Recommended UI:**

- Add an inline search strip inside Cockpit, adjacent to or directly below `.terminal-toolbar`.
- Keep it compact and instrument-like: query input, previous/next, match count, toggles for case/regex/whole word, close button.
- Do not use a floating search modal; terminal search should feel attached to the terminal viewport.

**Visual treatment:**

- Background: `--surface-1` or `--surface-2`.
- Border: `--hairline`.
- Active/focus: `--primary-focus-border` and `--primary-focus-shadow`.
- Selected/toggled options: `--primary-subtle-bg` and `--primary-subtle-border`.

### 3.2 Font size controls

**Current state:** xterm font size is hardcoded to `14` in `terminal-adapter.ts`.

**Native convention:**

- macOS: `Cmd+=`, `Cmd++`, `Cmd+-`, `Cmd+0`.
- Linux/Windows: `Ctrl+=`, `Ctrl++`, `Ctrl+-`, `Ctrl+0`, optionally `Ctrl+Shift+=` for keyboard layouts where plus requires shift.

**Recommended UI:**

- Add compact controls to the terminal toolbar: `−`, current size (`14px`), `+`, reset.
- Persist in `localStorage`.
- Clamp to a sane range, e.g. 10–24px.
- After changing font size, clear measured cell metrics, fit the terminal, and resize the tmux pane.

### 3.3 Activity indicators on window/pane tabs

**Current state:** Tabs show selected state and pane count only. There is no background activity signal.

**Native precedent:** tmux, iTerm2, Windows Terminal, and Warp all expose some notion of activity/bell/progress in inactive tabs.

**Recommended first implementation:**

- Track recent terminal output timestamps for the currently connected pane and maintain a `Record<paneId, number>`.
- When a pane/window has output and is not selected, show a small activity dot on its tab for a short interval (2–5 seconds).
- Because the app currently streams only the selected pane, do not pretend to monitor all background panes. Start with honest “recent activity observed for panes we have streamed or refreshed.”
- If the API later exposes background pane activity, wire those timestamps into the same component API.

**Visual treatment:**

- Dot size: 6px.
- Recent output: `--primary` dot with subtle pulse.
- Avoid new rainbow states. Use semantic colors only if the data is truly semantic, e.g. danger for failed/exited process.

### 3.4 Shortcut help / discoverability

**Current state:** No UI lists shortcuts. Existing shortcuts are discoverable only from source code:

- `Alt+1..9` — switch windows.
- `Alt+ArrowLeft/Right` — previous/next window.
- `Ctrl+Alt+ArrowLeft/Right` — previous/next pane.
- `Ctrl+L` — focus pane input row.

**Recommended UI:**

- Add a compact shortcut panel later, triggered by `?` when not in terminal text-input mode.
- For the immediate implementation prompt, include shortcut hints in tooltips/title attributes or small toolbar labels only where needed.

### 3.5 Stronger terminal focus state

**Current state:** `.terminal .xterm.focus` uses a 1px outline with `--primary-focus-ring`, offset inward.

**Recommended UI:**

- Strengthen focus state subtly, e.g. terminal wrap border/ring when xterm is focused.
- Avoid bright decoration. The indication should be operational: “keyboard target is terminal.”

---

## 4. Priority-ordered improvement list

### P0 — Preserve TUI correctness and input behavior

1. Preserve the xterm.js foundation and do not regress the existing WebSocket stream path.
2. Keep direct terminal input routed through `term.onData` only; do not reintroduce `onKey` forwarding.
3. Preserve `normalizeAnsi(payload.data)` for streaming output.
4. Preserve dispose/recreate behavior when leaving and returning to Cockpit.

### P1 — Remove design contract violations

1. Remove `.window-strip::after` decorative gradient.
2. Remove `.topbar` backdrop blur/glass effect.
3. Replace hardcoded terminal backgrounds in CSS with `var(--canvas)`.
4. Reduce decorative terminal/modal shadows to hairline-based separation.

### P2 — Add native terminal controls

1. Add terminal search using `@xterm/addon-search` and `Cmd/Ctrl+Shift+F` shortcuts.
2. Add font size controls and keyboard shortcuts with persistence.
3. Add activity indicators to window and pane tabs using honest recent-output tracking.
4. Strengthen terminal focus indication.

### P3 — Refactor for safe future work

1. Split `main.tsx` into components under `apps/website/src/components/` while keeping behavior and selectors stable.
2. Extract terminal toolbar/search/font UI into focused Cockpit components.
3. Keep state orchestration in `App` for now; do not introduce a global state library in this pass.
4. Extract pure tmux selection/preview helpers into a utility module only if needed for clean component boundaries.

### P4 — Follow-up UX enhancements

1. Add shortcut help panel (`?`).
2. Add terminal theme presets after search/font/activity are stable.
3. Add Fleet search/filter for large session lists.
4. Add command history for the pane input row.
5. Improve notice stacking/auto-dismiss/fixed positioning.

---

## 5. Recommended implementation stance

The next coding worker should make this an incremental Cockpit/Fleet refactor, not a visual rewrite. Preserve the current black cockpit identity, keep the terminal as the primary surface, and add native-terminal functionality in the smallest safe layers:

1. Component extraction with stable DOM/classes.
2. Search addon + search strip.
3. Font size controls + resize/refit integration.
4. Activity dots on tabs.
5. CSS cleanup for DESIGN.md compliance.

Do not introduce decorative gradients, glass, emoji, fake metrics, large rounded cards, or marketing copy.
