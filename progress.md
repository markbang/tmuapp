# Refactoring Progress

## Completed

- [x] Keyboard double-send bug: removed onKey handler, rely solely on onData
- [x] Keyboard e2e test suite: 24 tests covering control chars, navigation, editing, modifiers
- [x] TUI rendering: normalizeAnsi applied to streaming data
- [x] Stream race fix: buffer control stream output until initial capture sent
- [x] Terminal blank on session switch: dispose terminal + clear refs on view change
- [x] Web terminal swap: @wterm/dom → xterm.js v6 + WebGL + Ligatures + Image + Search
- [x] Web UI: 23 new CSS tokens, zero hardcoded colors
- [x] Web UI: search bar (Ctrl+Shift+F), font size (Cmd+=/Cmd+-/Cmd+0), activity dots
- [x] Web UI: DESIGN.md violations fixed (gradient, blur, shadow)
- [x] Web UI: component extraction (main.tsx split into components/ + tmux-helpers.ts + focus-trap.ts + types.ts)
- [x] Android: WebView+xterm.js terminal with WebSocket streaming
- [x] Android: theme unified with web tokens.css
- [x] Android: shortcut help dialog, session previews, CDN fallback, WebView lifecycle
- [x] All 41 e2e tests pass
- [x] vp check: 32 files, 0 errors

## Files Changed

- apps/website/src/main.tsx (1306 lines, split from 1635)
- apps/website/src/components/\*.tsx (9 files)
- apps/website/src/tmux-helpers.ts, focus-trap.ts, types.ts
- apps/website/src/terminal/terminal-adapter.ts
- apps/website/src/terminal/terminal-protocol.ts, terminal-fit.ts, terminal-scroll.ts
- apps/website/src/styles/\*.css (6 files)
- apps/website/tests/e2e/terminal.spec.ts, keyboard.spec.ts
- apps/website/package.json
- apps/api/src/tmux-stream.ts
- apps/android/\*_/_.kt (MainActivity, ApiClient, TmuappTheme)
- apps/android/app/build.gradle.kts
- pnpm-workspace.yaml, pnpm-lock.yaml
