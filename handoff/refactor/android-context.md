# Android App Audit — Terminal Rendering Overhaul Context

> **Audit date:** 2026-05-15
> **Source files audited:** `MainActivity.kt`, `ApiClient.kt`, `TmuappTheme.kt`
> **Cross-referenced:** Web app (`main.tsx`, `terminal-adapter.ts`, `terminal-protocol.ts`, `tokens.css`), API server (`server.ts`, `tmux-stream.ts`), shared types (`packages/utils/src/index.ts`), `build.gradle.kts`
> **Web research:** ConnectBot TermLib (Maven Central `org.connectbot:termlib`), OkHttp WebSocket docs, Android Compose keyboard handling

---

## 1. Terminal Rendering

### Current state

- **MainActivity.kt lines ~570-595** (`TerminalPanel` composable): Uses `BasicText` with `FontFamily.Monospace` in a scrollable `Box`. No real terminal emulation.
- **ApiClient.kt line ~154** (`parseCapture`): Calls `stripAnsi()` which removes ALL ANSI escape codes with regex `\u001B\[[;?0-9]*[ -/]*[@-~]` before returning `PaneCapture.ansi`. The terminal panel receives already-stripped plain text.
- No cursor positioning, no color, no bold/underline, no scrollback, no selection, no resize feedback.

### Rendering options — ranked

| Option                                            | Feasibility                                                                    | Effort                           | Risk        | Verdict                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ConnectBot TermLib** (`org.connectbot:termlib`) | ✅ High — Compose-native, Canvas-based, libvterm JNI, Maven Central `v0.0.22+` | Medium                           | Low         | **Best fit.** Pure display component matching the web app's "terminal as device boundary" pattern. Handles VT100/ANSI, 256+true color, scrollback, text selection, touch magnifier. Apache 2.0. Caller manages I/O — same role as current `TermAdapter` in web. |
| **WebView + xterm.js**                            | ⚠️ Medium — works but…                                                         | Low to integrate, High to bridge | Medium-High | Proven (same xterm as web app). But documented Android WebView performance issues at cols≥200 (xtermjs#4597), DOM renderer pressure, JavaScript bridge complexity, ~50MB Chromium memory overhead per WebView. Terminates Compose-native approach.              |
| **Custom Canvas renderer**                        | ⚠️ Low — huge scope                                                            | Very High                        | High        | Full VT100 parser + cell buffer + cursor + selection + scrollback + touch. xterm.js is ~60K SLOC. Not practical for this app's scope.                                                                                                                           |
| **OpenGL/Vulkan custom**                          | ❌ Overkill                                                                    | Extreme                          | Extreme     | Terminals are character-grid, not 3D. Text rendering needs GPU-accelerated glyph atlases — already what Canvas does. No benefit.                                                                                                                                |

### Recommendation

**Use ConnectBot TermLib (`org.connectbot:termlib`).**

- **Dependency:** `implementation("org.connectbot:termlib:0.0.22")` (or latest; Maven Central has releases up to at least 0.0.35 as of April 2026)
- **Integration surface:**
  - `Terminal` (JNI wrapper around libvterm) — handles input processing, keyboard event generation
  - `TerminalBuffer` — Compose state management for terminal content and scrollback
  - `TermScreen` — main Composable providing Canvas rendering + touch interactions
- **Architecture fit:** TermLib is a "pure display component" — caller manages I/O. This means the Android app would own the WebSocket/HTTP I/O and feed data to TermLib's `write` method, exactly mirroring the web app's `TermAdapter` pattern.
- **Remove:** `stripAnsi()` from `ApiClient.kt`'s `parseCapture()` — ANSI must be preserved for real terminal rendering.

### Data flow target

```
tmux API WebSocket → JSON parse → terminal.write(ansi data)
tmux API HTTP capture → JSON parse → terminal.write(ansi data)
User key input → terminal.key event → WebSocket { type: "input", data } or HTTP /keys
```

---

## 2. Input Handling

### Current state

- **MainActivity.kt lines ~310-326** (`sendPaneInput`): Uses `BasicTextField` (text input only), two buttons: "Run" (sends text via `/api/panes/:id/input` then `/api/panes/:id/keys` with Enter) and "Enter" (sends Enter only).
- No raw keystroke forwarding. No hardware keyboard support. No special key support (Tab, Ctrl+C, arrows, etc.).

### Android Compose keyboard API

Android Jetpack Compose exposes these key interception points:

| Modifier / API                                                         | Purpose                                                                     | Stack                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| `Modifier.onKeyEvent { KeyEvent -> Boolean }`                          | Intercept after focus target, on return path                                | api docs: _Handle keyboard actions_              |
| `Modifier.onPreviewKeyEvent { KeyEvent -> Boolean }`                   | Intercept before focus target                                               | api docs: _KeyEvent_ reference                   |
| `Modifier.onInterceptKeyBeforeSoftKeyboard { KeyEvent -> Boolean }`    | Intercept hardware keys before soft keyboard (for D-Pad, physical keyboard) | api docs: _onInterceptKeyBeforeSoftKeyboard_     |
| `Modifier.onPreInterceptKeyBeforeSoftKeyboard { KeyEvent -> Boolean }` | Same, but on preview path (parents before focused)                          | api docs: _SoftKeyboardInterceptionModifierNode_ |

`KeyEvent` fields: `.key` (Key enum), `.type` (KeyUp/KeyDown), `.utf16CodePoint`, `.nativeKeyEvent` (Android `android.view.KeyEvent`).

### Web app's input contract (for reference)

From `apps/website/src/terminal/README.md` and `terminal-adapter.ts`:

1. **Raw typing via WebSocket:** `{ type: "input", data: "<raw chars>" }` — xterm.js `onData` for printable chars + Enter, `onKey` for control chars (Backspace, Ctrl+C, arrows, etc.).
2. **Named keys via HTTP:** `POST /api/panes/:id/keys { keys: ["Enter"] }` — for keys that don't map to raw text (Enter, Tab, etc.).
3. **Command form:** Sends `/api/panes/:id/input` + Enter via `/keys` — the HTTP path.
4. **Golden rule:** When WebSocket stream is open, raw keystrokes go through WebSocket. Named keys go through HTTP `/keys`. If streaming fails before first output, fall back to HTTP capture.

### Target input architecture for Android with TermLib

TermLib's `Terminal` JNI wrapper provides keyboard event generation. The Android app should:

1. **When WebSocket stream is open:** Forward raw keystrokes via `{ type: "input", data }` on WebSocket. Send special keys (Enter, Tab, arrows) via HTTP `POST /api/panes/:id/keys`.
2. **When only HTTP capture:** Use the existing command form (`/input` + Enter via `/keys`) for batch commands. Also route individual special keystrokes through `/keys`.
3. **Hardware keyboard:** Apply `Modifier.onInterceptKeyBeforeSoftKeyboard` on the terminal composable to capture all physical keyboard events and forward them. This works for both D-Pad navigation and USB/BT keyboards.
4. **Virtual keyboard (soft keyboard):** TermLib's `TermScreen` may handle this natively via Compose's text input framework. If not, provide a visible `BasicTextField` for soft-keyboard text composition, forwarding to terminal.

---

## 3. Streaming

### Current state

- **HTTP only:** `ApiClient.kt` uses `OkHttpClient` with `GET /api/panes/:id/capture?lines=120`. No real-time streaming.
- `capturePane()` is called manually by the user pressing "Capture" button or auto-refreshed when switching panes.
- No WebSocket connection anywhere in the Android codebase.

### API WebSocket endpoint

From `server.ts` lines ~94-120 (`attachPaneStream`):

- **Endpoint:** `ws://host/api/panes/:paneId/stream` (auth via `?token=` query param)
- **Server → Client:** `{ type: "output", data: "<ansi>" }` or `{ type: "error", message: "..." }`
- **Client → Server:** `{ type: "input", data: "<raw text>" }` or `{ type: "resize", columns: N, rows: M }`
- **Initial capture:** Server sends historical output via `capture-pane -S -240` before starting live stream, preventing duplicate content.
- **Auth:** Bearer token in `Authorization` header or `x-tmuapp-token` header or `?token=` query param for WebSocket.

### OkHttp WebSocket support

- **Already in dependencies:** `com.squareup.okhttp3:okhttp:5.3.2` in `app/build.gradle.kts`
- **API:** `OkHttpClient.newWebSocket(request, listener)` returns `WebSocket`
- **WebSocketListener interface:** `onOpen`, `onMessage`, `onClosing`, `onClosed`, `onFailure`
- **Ping/pong:** `OkHttpClient.Builder.pingInterval(duration)` — automatically sends HTTP/2 and WebSocket pings to keep connection alive
- **Reconnection:** Must be implemented manually with exponential backoff (OkHttp does not auto-reconnect)

### Battery impact

- Persistent WebSocket with 30-second ping interval is standard for real-time apps (chat, terminals). Battery drain is minimal when idle — TCP keepalive + ping/pong frames are tiny. Actual battery impact comes from rendering terminal output, not from keeping the connection open.
- Recommended: `pingInterval(30, TimeUnit.SECONDS)` on the OkHttp client, plus explicit close when leaving the Manage view.

### Target streaming architecture

```
Android ManageView
  ├─ WebSocket (OkHttp) ──→ ws://host/api/panes/:id/stream
  │   ├─ onMessage: parse JSON → termlib.write(data)
  │   ├─ onFailure/onClosed: fallback to HTTP capture
  │   └─ pingInterval: 30s
  ├─ HTTP capture fallback
  │   └─ GET /api/panes/:id/capture?lines=240 → termlib.write(ansi)
  └─ 3-second fallback timer (match web app pattern):
      if WebSocket delivers no output in 3s → close → fall back to HTTP capture
```

---

## 4. UI Gaps vs Web App

### Gap analysis

| Feature                                      | Web (Fleet/Cockpit)                                                                                              | Android current                                                                                                                             | Gap                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Session previews in grid**                 | Fetches 8-line capture per session, shows `<pre class="session-preview">` with loading/fallback states           | `SessionCard` shows pane title/command only in a `Box` (MainActivity.kt ~510-530)                                                           | **Major.** Session cards feel empty without live preview.                                                       |
| **Multi-pane display**                       | Pane count pills (`Chip className="pane-count-pill"`), pane tabs with selected state styling                     | `SelectorStrip` for windows and panes (horizontal scroll), pane count on window labels                                                      | **Moderate.** Functional but less polished.                                                                     |
| **Window/pane switching keyboard shortcuts** | Alt+1-9 for window, Alt+Arrow for prev/next window, Ctrl+Alt+Arrow for prev/next pane, Ctrl+L to focus input     | No keyboard shortcuts                                                                                                                       | **Missing.** Physical keyboard users get no shortcuts.                                                          |
| **Resize handling**                          | Full: fits terminal to container, sends `POST /api/panes/:id/resize` with `width/height`, debounced 150ms        | No resize at all. Terminal panel is static height.                                                                                          | **Major.** Terminal doesn't adapt to screen size or orientation changes.                                        |
| **Token configuration persistence**          | `localStorage.getItem/setItem(apiTokenStorageKey)` — survives page reload. Saved instantly on token dialog save. | `SharedPreferences` — token saved on explicit "Save settings" action in settings screen. `connectInitial()` also calls `persistSettings()`. | **Minor.** Flow works but "Save settings" is a separate step. Token should persist on connect or via auto-save. |
| **Attached/detached status**                 | `StatusChip` with green "attached" / amber "detached"                                                            | `StatusPill` with same colors (MainActivity.kt ~491)                                                                                        | **Present.** ✅                                                                                                 |
| **Kill window confirmation**                 | Modal dialog with "This action cannot be undone"                                                                 | No confirmation — `killCurrentWindow()` executes immediately (MainActivity.kt ~278)                                                         | **Dangerous.** No confirmation dialog for destructive action.                                                   |
| **WebSocket streaming status indicator**     | Terminal toolbar shows dot + "Preparing terminal…" during loading                                                | No streaming status — just generic "loading" on capture operation                                                                           | **Missing.** No stream-connected/disconnected indicator.                                                        |
| **Auto-refresh on return to overview**       | `setPreviewRun(run => run + 1)` triggers session preview re-fetch                                                | No auto-refresh when navigating back to overview                                                                                            | **Minor.** Snapshot is stale until manual refresh.                                                              |

### Prioritized fix list

1. **P0 — Resize handling:** Essential for usable terminal. Must fit to container and send resize to tmux.
2. **P0 — WebSocket streaming:** Core feature gap. Without streaming, the app is a stagnant capture tool.
3. **P0 — Proper terminal rendering (TermLib):** Prerequisite for both of the above to matter.
4. **P1 — Kill window confirmation:** Safety regression from web.
5. **P1 — Session previews in grid:** Major UX gap. Makes the fleet overview feel empty.
6. **P2 — Keyboard shortcuts:** Expected by power users with physical keyboards.
7. **P2 — Multi-pane polish:** Pane count pills, tab styling.

---

## 5. Theme Unification

### Current discrepancy

**Android `DarkPalette` (TmuappTheme.kt) vs Web dark tokens (tokens.css):**

| Semantic slot | Android value | Web value            | Match?                        | Impact                 |
| ------------- | ------------- | -------------------- | ----------------------------- | ---------------------- |
| `canvas`      | `#07090D`     | `#010102`            | ❌ Off by ~2%                 | Background base tone   |
| `surface1`    | `#10141B`     | `#0F1011`            | ❌ Different tone curve       | Card/chip background   |
| `surface2`    | `#171C24`     | `#141516`            | ❌                            | Elevated surface       |
| `surface3`    | `#202733`     | `#18191A`            | ❌                            | Peak surface           |
| `primary`     | `#5E6AD2`     | `#5e6ad2`            | ✅                            | Accent color           |
| `success`     | `#42C48C`     | `#27a644`            | ❌                            | Success pill/indicator |
| `warning`     | `#E6B450`     | `#d99a2b`            | ❌                            | Warning pill/indicator |
| `danger`      | `#FF6B6B`     | `#ff6b6b`            | ✅                            | Danger/error color     |
| `ink`         | `#F6F7FB`     | `#f7f8f8`            | ❌ Near-white differs         | Primary text           |
| `inkMuted`    | `#A2AAB8`     | `#d0d6e0`            | ❌ Much dimmer (~63% vs ~82%) | Secondary text         |
| `stroke`      | `#2B3442`     | `#23252a` (hairline) | ❌                            | Border lines           |

**What Android is MISSING from the web token set:**

- `surface4` / `hairline-strong` / `hairline-tertiary`
- `primary-hover`, `primary-focus-ring`, `primary-focus-outline`, `primary-dim-border`, `primary-subtle-bg`
- `danger-text-status`, `danger-dim-border`, `danger-dim-bg`, `danger-hover-bg`
- `success-text`, `warning-text`
- `preview-bg`, `preview-text`
- `skeleton-shine`, `modal-backdrop`, `topbar-bg`, `terminal-overlay`
- `font` (sans stack), `mono` (mono stack)

### Recommendation

**Unify on web tokens as the single source of truth.**

- Replace `DarkPalette` values with exact hex values from `:root { }` in `tokens.css`.
- Keep the current 11-slot structure for the MVP Android palette but expand where needed:
  - Add `hairline` (replacing `stroke`), `hairlineStrong`
  - Add alpha variant colors that the web uses for focus/hover states
  - Add `surface4` for peak elevation
- `LightPalette` can remain as-is for now (light mode is Android-specific — web is dark-only).
- Future: Consider auto-generating the Kotlin palette from `tokens.css` to prevent drift.

### Web design-system rules (from `apps/website/src/design/README.md`)

These apply to Android too:

- "Black cockpit for tmux workspaces" — calm, operational, fast to scan
- Near-black surfaces with precise hairlines
- One lavender accent (`--primary`) for intent, focus, selected state
- Danger/success/warning are semantic, not decoration
- Monospace for terminal output/previews, sans for product chrome
- No gradients, no glassmorphism, no emoji UI, no oversized rounded cards

---

## 6. Implementation Risks

| Risk                                               | Severity | Mitigation                                                                                                                               |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TermLib is young (first release Nov 2025, v0.0.x)  | Medium   | API is stable for display/input. Wrap behind own `TermAdapter` interface (mirroring web pattern) so it can be swapped. Test extensively. |
| TermLib JNI/libvterm may not build for all ABIs    | Medium   | Project already builds 4 ABIs (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`). TermLib likely supports same. Verify before committing.     |
| OkHttp WebSocket on Android battery/Doze           | Low      | Use `pingInterval(30s)`, close WebSocket on view change, use foreground service if background streaming is needed (unlikely).            |
| Compose recomposition from streaming terminal data | Medium   | TermLib's `TerminalBuffer` is designed as Compose state — should be efficient. Batch writes, avoid per-character recomposition.          |
| Terminal resize during orientation change          | Low      | Android `Configuration` change restarts Activity by default. Either handle config changes manually or save/restore state.                |
| API token auth for WebSocket (query param)         | Low      | WebSocket upgrade doesn't carry custom headers in all environments. The API server supports `?token=` query param — use it.              |

---

## 7. Build & Dependency Context

**Current dependencies (app/build.gradle.kts):**

```kotlin
implementation(composeBom) // "androidx.compose:compose-bom:2026.04.01"
implementation("androidx.activity:activity-compose:1.13.0")
implementation("androidx.compose.foundation:foundation")
implementation("androidx.compose.ui:ui")
implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
implementation("com.squareup.okhttp3:okhttp:5.3.2")
```

**To add for this overhaul:**

```kotlin
implementation("org.connectbot:termlib:0.0.35") // or latest stable
```

**Build config:**

- `compileSdk = 36`, `minSdk = 26`, `targetSdk = 35`
- `versionCode = 2`, `versionName = "0.1.1"`
- Compose enabled via `buildFeatures { compose = true }`
- ABI splits: `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64` + universal APK

---

## 8. Validation Plan

### After terminal rendering changes:

1. Build: `./gradlew assembleDebug` (project root: `apps/android/`)
2. Verify TermLib renders ANSI correctly:
   - Colored text (256-color TrueColor escape sequences)
   - Cursor positioning
   - Bold/underline/italic
   - Scrollback buffer
   - Text selection + copy
3. Verify WebSocket streaming:
   - Connect to pane, verify live output appears
   - Type in terminal, verify input reaches tmux
   - Kill WebSocket, verify fallback to HTTP capture
4. Verify resize:
   - Rotate device, terminal should re-fit
   - Split screen (multi-window on Android), terminal should re-fit
5. Verify theme: Compare side-by-side with web app dark mode
6. Run existing Android lint/check: `./gradlew lint`

### After UI gap fixes:

1. Session preview fetches correctly for all sessions in grid
2. Confirmation dialog appears before killing window
3. Physical keyboard sends KeyEvents to tmux (if keyboard available)

---

## 9. File Impact Map

| File                   | Changes needed                                                                                                                                                          | Type                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----- |
| `ApiClient.kt`         | Remove `stripAnsi()`, add WebSocket client, add resize endpoint call                                                                                                    | Heavy                                              |
| `MainActivity.kt`      | Replace `TerminalPanel` with TermLib, add WebSocket lifecycle, add keyboard handling, add resize, add confirmation dialog, add session previews, add keyboard shortcuts | Heavy (possibly split into multiple files)         |
| `TmuappTheme.kt`       | Update `DarkPalette` values to match web tokens. Consider expanding palette.                                                                                            | Light                                              |
| `app/build.gradle.kts` | Add `org.connectbot:termlib` dependency                                                                                                                                 | Light                                              |
| `AndroidManifest.xml`  | May need `android:configChanges="orientation                                                                                                                            | screenSize"` to prevent Activity restart on resize | Light |

---

## 10. Architectural Recommendation

**Follow the web app's terminal boundary pattern** (from `apps/website/src/terminal/README.md`):

> The terminal module is the fragile core of tmuapp. Treat it as a device boundary, not a normal UI widget.

Create an Android `TerminalAdapter` wrapper (Kotlin interface) that wraps TermLib, exposing:

- `write(data: String)` — feed ANSI output
- `resize(cols: Int, rows: Int)` — request terminal resize
- `reset()` — clear terminal
- `dispose()` — cleanup
- `onData: ((String) -> Unit)?` — callback for user keystrokes

The ManageView composable owns the adapter lifecycle, WebSocket connection, HTTP fallback, and resize observer — exactly as `main.tsx` does with `TermAdapter`.
