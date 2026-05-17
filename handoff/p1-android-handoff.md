# P1.1 Android Watch Experience — Implementation Handoff

## Changes

**File**: `apps/android/app/src/main/kotlin/dev/tmuapp/mobile/MainActivity.kt`

### 1. Quick Command Bar

- `QuickCommandBar` + `QuickBtn` composables added below TerminalScreen header
- 5 buttons: Y, N, ⏎ (Enter), ⌃C (Ctrl+C), ⌃D (Ctrl+D)
- Styled: indigo accent, 36dp height, rounded 6dp, white text, monospace font
- Sends commands via streamConn (WebSocket) if open, falls back to HTTP

### 2. Session Status Badges

- `SessionCard` now shows:
  - Green "AGENT" badge when session name contains pi/codex/claude (case-insensitive)
  - Indigo "ACTIVE" badge when attached
  - Grey dot + "detached" text when detached
  - Delete (✕) hidden in read-only mode for detached sessions

### 3. Read-Only Mode

- Toggle switch ("READ" label) in Dashboard header
- Persists via `SharedPreferences` key `readOnly`
- When enabled: hides NEW button, hides delete icons, shows "Read-only mode" toast on create attempt
- State: `var readOnly by rememberSaveable { mutableStateOf(prefs.getBoolean(PrefReadOnly, false)) }`

### 4. Delete Confirmation

- `deleteTarget` state holds pending delete session ID
- `AlertDialog` with title "Delete session {name}?", body "This cannot be undone."
- DELETE (red) / CANCEL buttons
- `confirmDelete()` performs the actual deletion

### Design

- All colors from the design tokens (AccentColor=indigo, BgColor, HeaderColor, etc.)
- No hardcoded hex values beyond the token definitions
- Matches existing Dashboard layout

## Validation

- Brace count balanced (216/216)
- All composable functions have proper annotations
- No new imports needed (all components already imported)
