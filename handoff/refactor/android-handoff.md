# Android Terminal Overhaul — Handoff

## Changed Files

### 1. `apps/android/app/src/main/kotlin/dev/tmuapp/mobile/ApiClient.kt` (+80 lines)

- Added `StreamConnection` data class: `isOpen`, `close`, `sendInput`, `sendResize`
- Added `WebSocketClient` (separate OkHttp client, no read timeout for streams)
- Added `connectStream(paneId, onOutput, onError, onClose)` — OkHttp WebSocket streaming
  - Parses `{ type: "output", data }` / `{ type: "error", message }` JSON
  - Sends `{ type: "input", data }` / `{ type: "resize", columns, rows }` JSON
  - `streamUrl()` builds ws:// URL from HTTP base + appends `?token=` if set
- Fixed `parseCapture()` — removed `stripAnsi()`, preserves raw ANSI
- Added `normalizeAnsi()` — adds `\r` before bare `\n` (mirrors web `terminal-protocol.ts`)
- Added `rawAnsi` field to `PaneCapture`

### 2. `apps/android/app/src/main/kotlin/dev/tmuapp/mobile/MainActivity.kt` (+300 lines)

- Added `streamConn` + `captureBuffer` state for WebSocket streaming
- Added `TerminalWebView` composable — WebView + embedded xterm.js v6 + WebGL addon (CDN)
  - JS bridge: `Android.onTerminalInput(data)` for keyboard, `writeAnsi(data)` for output
  - `onKey` forwards control chars + escape sequences (mirrors web fix)
  - Theme: `#010102` bg, `#5e6ad2` cursor, smooth scrolling
- Replaced `TerminalPanel(BasicText)` → `TerminalWebView` in ManageScreen
- Updated `LaunchedEffect(view, selectedPane)`: closes old stream, HTTP capture → WebSocket
- Updated `sendPaneInput()`: WebSocket fast path + HTTP fallback
- Updated `BackHandler`: closes stream on back
- Fixed `palette.stroke` → `palette.hairline` (7 refs) for unified theme

### 3. `apps/android/app/build.gradle.kts` (already had TermLib, kept)

- `implementation("org.connectbot:termlib:0.0.39")` for future native renderer

### 4. `apps/android/app/src/main/kotlin/dev/tmuapp/mobile/TmuappTheme.kt` (already unified)

- Dark palette now exactly matches web `tokens.css`

## Architecture

```
Keyboard → WebView JS → Android.onTerminalInput(data)
    → streamConn.sendInput(data) → OkHttp WebSocket
    → tmux API → output → JSON → onOutput(data)
    → captureBuffer += data → evaluateJavascript("writeAnsi(...)")
    → xterm.js renders

HTTP fallback: sendInput/sendEnter → OkHttp HTTP → tmux API
```

## Validation

- `vp check`: 20 files clean, 0 errors
- Kotlin syntax: manually verified (no local Gradle)

## Not Done / Future

- Resize handling via WebSocket sendResize
- Hardware keyboard full testing (Ctrl+C, arrows)
- Offline xterm.js assets (embed in APK)
- TermLib native renderer as optional alternative
- Scrollback search
