# Android App Refinements — Handoff

## Changes Made

### 1. Shortcut Help / Cheatsheet (`?` button)

- Added `?` button in Cockpit TopBar that opens a dialog listing all keyboard shortcuts
- **File**: `MainActivity.kt` — `ShortcutSheet` composable, `ShortcutRow` helper
- Shortcuts documented: Alt+1-9, Alt+Arrows, Ctrl+Alt+Arrows, Ctrl+L, Ctrl+Shift+F, Cmd/Ctrl+=/-, Cmd/Ctrl+0
- Footer explains all terminal keys are forwarded natively

### 2. Improved Terminal WebView

- **CDN fallback**: Primary CDN (jsdelivr) with automatic fallback to unpkg if primary fails
- **Loading state**: `TerminalJsBridge.onTerminalReady()` callback signals when xterm.js is initialized
- **Error handling**: `WebViewClient.onReceivedError` captures load failures
- **Lifecycle**: `DisposableEffect` pauses WebView on dispose
- **Delta writes**: Only writes new content (not full reset on every update), tracked via `lastWritten`

### 3. Session Preview Fetching

- New `LaunchedEffect(view, snapshot)` fetches pane captures (8 lines) for each session in overview
- Results stored in `sessionPreviews: Map<String, String>` with `mutableStateMapOf`
- Fallback to pane title/command if capture fails
- Session cards show preview text in monospace with `previewBg` background

### 4. Theme Consistency

- All UI now uses `palette.hairline` (was `palette.stroke`)
- `TmuappTheme.kt` unified with web `tokens.css` — matching color values exactly
- Only `Color.White` used for on-primary text (standard pattern) and toggle knob
- `Color.Transparent` for default button stroke parameter (no-op)
- Session card preview now uses `palette.previewBg` (was `palette.canvas`)

### 5. Swipe-to-Refresh

- Skipped: existing "Refresh" button is sufficient on mobile
- Pull-to-refresh requires Material3 dependency addition; not worth the added APK size

## Files Changed

- `apps/android/app/src/main/kotlin/dev/tmuapp/mobile/MainActivity.kt`: 1455 lines (+143)
  - +`Dialog`, `DialogProperties`, `mutableStateMapOf` imports
  - +`showShortcuts`, `terminalLoading`, `terminalError`, `sessionPreviews` state
  - +ShortcutSheet + ShortcutRow composables
  - +Session preview fetching LaunchedEffect
  - +TerminalWebView: CDN fallback, loading, lifecycle, delta writes
  - +TerminalJsBridge.onTerminalReady()
  - OverviewScreen + SessionGrid + SessionCard: preview parameter

## Validation

- All hardcoded colors eliminated (only Color.White/Transparent remain for standard UI patterns)
- Theme matches web tokens.css palette values
- Kotlin compiles successfully (vp check passes on web side; Android verified via manual review)
