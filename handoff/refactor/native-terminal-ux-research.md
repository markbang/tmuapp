# Research: Web Terminal UX — Native Terminal Conventions & Technology

## Summary

Native terminal emulators (kitty, Ghostty, iTerm2, Warp) have established strong keyboard shortcut conventions centered on Cmd on macOS and Ctrl+Shift on Linux/Windows. GPU-accelerated rendering (OpenGL, Metal, WebGL2) with glyph atlas sprites is the standard approach, while ligatures and subpixel rendering remain divisive. xterm.js v6 (Dec 2025) is the incumbent web library with Kitty graphics protocol support recently added; new challengers like react-term (WebGL2 + SharedArrayBuffer) and wterm (DOM + Zig WASM) offer architectural alternatives. For TUI rendering, synchronized output (DEC 2026) and differential rendering are becoming critical for flicker-free experiences.

---

## Findings

### 1. Keyboard Shortcut Conventions

#### 1.1 Tab/Window Management

- **New Tab:** `Cmd+T` (macOS) or `Ctrl+Shift+T` (Linux/Windows) — universal across Ghostty, kitty, iTerm2, Warp, Terminal.app. [Source](https://ghostty.org/docs/config/keybind/reference) [Source](https://sw.kovidgoyal.net/kitty/invocation/)
- **Close Tab/Pane:** `Cmd+W` (macOS) or `Ctrl+Shift+W` — Ghostty, kitty, iTerm2. Warp also uses `Cmd+W`. [Source](https://www.mintlify.com/ghostty-org/ghostty/features/splits-tabs)
- **Switch Tabs 1-9:** `Cmd+1` through `Cmd+9` on macOS (Ghostty, iTerm2, Warp); `Alt+1-9` on Linux (Ghostty, kitty uses `Ctrl+Alt+1-9`). [Source](https://github.com/conlonj25/ghostty-cheatsheet) [Source](https://docs.warp.dev/getting-started/keyboard-shortcuts/)
- **Next/Previous Tab:** `Cmd+Shift+]` / `Cmd+Shift+[` (macOS), or `Ctrl+Shift+Right/Left` (kitty), `Ctrl+Tab` / `Ctrl+Shift+Tab` (Warp). Ghostty also supports `Cmd+Alt+Left/Right`. [Source](https://www.mintlify.com/ghostty-org/ghostty/features/splits-tabs)
- **New Window:** `Cmd+N` on macOS (Ghostty, iTerm2, Terminal.app); `Ctrl+Shift+N` on Linux (kitty).
- **Move Tab:** Ghostty supports `move_tab:+1` / `move_tab:-1` to reorder tabs cyclically. [Source](https://ghostty.org/docs/config/keybind/reference)

#### 1.2 Pane/Split Management

- **Split Right (Horizontal):** `Cmd+D` — standard on Ghostty, iTerm2, Terminal.app. **Warp originally used `Cmd+E`** but users filed issues to align with convention; Warp now supports both. [Source](https://github.com/warpdotdev/Warp/issues/600)
- **Split Down (Vertical):** `Cmd+Shift+D` — standard on Ghostty, iTerm2, Terminal.app. [Source](https://mvolkmann.github.io/blog/ghostty/?v=1.1.1)
- **Navigate Splits:** `Cmd+Alt+Arrow` keys (Ghostty). Warp uses `Cmd+Option+Arrow`. kitty uses `Ctrl+Shift+[/]` for next/previous window.
- **Close Split:** `Cmd+W` — same as closing a tab; closes the focused pane.
- **Zoom/Toggle Split:** `Cmd+Shift+Enter` (Ghostty, iTerm2) — expands the focused pane to fill the tab.
- **kitty note:** kitty doesn't let you choose split direction — it uses `Ctrl+Shift+Enter` for new windows, then `Ctrl+Shift+L` cycles through layouts (Stack, Tall, Fat, Grid, Horizontal, Splits, Vertical). [Source](https://www.pashynskykh.com/kb/kitty/)

#### 1.3 Scroll Navigation

- **Page Up/Down (scrollback):** `Shift+PageUp` / `Shift+PageDown` on macOS; `Ctrl+Shift+PageUp/Down` on Linux/Windows. `Cmd+PageUp/Down` on macOS. [Source](https://domterm.org/Keyboard-shortcuts.html) [Source](https://github.com/wavetermdev/waveterm/pull/2679)
- **Scroll to Top/Bottom:** `Cmd+Up` (top) / `Cmd+Down` (bottom) — Apple Terminal.app, adopted by Wave Terminal. Also `Cmd+Home` / `Cmd+End`. [Source](https://support.apple.com/en-by/guide/terminal/trmlshtcts/mac)
- **Scroll Line-by-Line:** `Cmd+Up Arrow` / `Cmd+Down Arrow` in Apple Terminal.
- **Ghostty scroll actions:** `scroll_page_fractional:0.5`, `scroll_page_lines:3`, `scroll_to_top`, `scroll_to_bottom` — all bindable. [Source](https://ghostty.org/docs/config/keybind/reference)

#### 1.4 Copy/Paste

- **macOS:** `Cmd+C` (copy), `Cmd+V` (paste) — standard in Ghostty, kitty (via config), iTerm2, Warp. kitty defaults to `Cmd+C` for copy on macOS. [Source](https://sw.kovidgoyal.net/kitty/actions/?highlight=new_os_window)
- **Linux/Windows:** `Ctrl+Shift+C` (copy), `Ctrl+Shift+V` (paste) — universal convention to avoid conflicting with terminal `Ctrl+C` (SIGINT) and `Ctrl+V` (literal next). [Source](https://github.com/paulrobello/par-term/blob/main/docs/KEYBOARD_SHORTCUTS.md)
- **Selection copy (middle-click):** kitty and most X11/Linux terminals support middle-click paste from selection buffer. kitty supports `copy_on_select yes` to auto-copy on selection.
- **Copy URL:** Ghostty has `copy_url_to_clipboard` for the URL under cursor. kitty has `Ctrl+Shift+U` for URL hints.

#### 1.5 Search

- **Open Search:** `Cmd+F` on macOS (Ghostty, iTerm2, Warp). `Ctrl+Shift+F` or `Ctrl+Shift+H` on kitty for scrollback search. [Source](https://www.terminal.guide/tools/terminal-emulator/kitty/)
- **Find Next/Previous:** `Cmd+G` / `Cmd+Shift+G` on macOS (Warp, iTerm2). Ghostty has `search_navigate` with previous/next semantics.
- **Ghostty search:** `search:""` starts search UI, `search:selection` searches for selected text, `search_navigate:next/previous` navigates, `end_search` hides UI. Supports regex. [Source](https://ghostty.org/docs/config/keybind/reference)

#### 1.6 Font Size

- **Increase:** `Cmd+=` (macOS), `Ctrl+=` or `Ctrl+Shift+=` (Linux/Windows) — standard across Ghostty, kitty, iTerm2, Warp, Terminal.app. Also `Cmd++` on macOS. [Source](https://sw.kovidgoyal.net/kitty/invocation/)
- **Decrease:** `Cmd+-` (macOS), `Ctrl+-` or `Ctrl+Shift+-` (Linux/Windows). [Source](https://docs.warp.dev/getting-started/keyboard-shortcuts/)
- **Reset:** `Cmd+0` (macOS), `Ctrl+0` — resets to configured font size. [Source](https://github.com/paulrobello/par-term/blob/main/docs/KEYBOARD_SHORTCUTS.md)
- **Note:** Warp had a bug where `Cmd+0` reset to 13pt ignoring user settings — fixed. Users on non-US keyboards (Swedish) report `Ctrl+Shift+=` issues for increase because `+` requires Shift. [Source](https://github.com/warpdotdev/Warp/issues/1580)

---

### 2. Terminal Visual Design Principles

#### 2.1 GPU Rendering & Text

- **kitty:** GPU-accelerated via OpenGL. Uses a sprite-based glyph atlas: each character is rendered once into a GPU texture atlas, then composited via instanced quads — typically 2 draw calls per frame (background + foreground). **Does NOT support ligatures** — the cell-grid architecture renders each character in isolation to the atlas, making ligatures (which span multiple cells) incompatible by design. **No subpixel rendering** — kitty maintainer argues high-DPI displays make subpixel rendering unnecessary and the 3× glyph cache penalty isn't worth it. [Source](https://github.com/kovidgoyal/kitty/issues/50) [Source](https://github.com/kovidgoyal/kitty/issues/214) [Source](https://deepwiki.com/kovidgoyal/kitty/4.3-gpu-shaders-and-cell-rendering)
- **Ghostty:** Uses platform-native UI (Metal on macOS, OpenGL on Linux) with GPU acceleration. Supports ligatures. Recent improvements moved glyph constraint logic to CPU (rasterization stage) for 1× computation instead of every-frame, and switched to nearest-neighbor sampling to eliminate inter-glyph atlas padding. [Source](https://github.com/ghostty-org/ghostty/pull/7809)
- **Alacritty:** GPU (OpenGL) with glyph atlas, 2 draw calls pattern — the model that influenced kitty's design.
- **Warp:** Alpha-only glyph atlas with 3 sub-pixel bins and SDF (signed distance field) rectangles for smooth scaling. [Source](https://github.com/rahulpandita/react-term) (react-term references Warp's rendering approach)

#### 2.2 Spacing, Padding & Margins

- Standard internal padding: 2–8px cell padding. kitty defaults to `window_padding_width 0` but 4–8px is common.
- Ghostty: no explicit global padding config — uses OS-native window chrome.
- iTerm2: configurable per-profile padding (0–50px). Default is 0.
- Character cell spacing: monospace fonts with 0 letter-spacing. Some terminals add a fractional cell-width gap.

#### 2.3 Cursor Design

- **DECSCUSR standard** (ANSI `ESC [ N SP q`): 0/1 = blinking block (default), 2 = steady block, 3 = blinking underline, 4 = steady underline, 5 = blinking beam/I-bar, 6 = steady beam. [Source](https://terminfo.dev/cursor/decscusr-cursor-shape)
- **Vim/editor conventions:** Block cursor for Normal mode, Beam/Bar cursor for Insert mode, Underline cursor for Replace mode. This is a de-facto standard driven by DECSCUSR escape sequences sent by editors. [Source](https://textcursor.com/faqs/)
- **Why blink:** Attention-grabbing without obscuring content. Terminals default to blinking block. Some users prefer steady (non-blinking).
- **WezTerm** offers `SteadyBlock`, `BlinkingBlock`, `SteadyUnderline`, `BlinkingUnderline`, `SteadyBar`, `BlinkingBar` as config values for `default_cursor_style`. [Source](https://wezterm.org/config/lua/config/default_cursor_style.html)

#### 2.4 Color Scheme Design Principles

- **ANSI 16-color palette** is the foundational layer: Black, Red, Green, Yellow, Blue, Magenta, Cyan, White (normal + bright variants, 16 total). A good scheme needs well-distinguishable bright variants and adequate contrast between normal and bright. [Source](https://mintlify.com/lassejlv/termy/guides/custom-themes)
- **True Color (24-bit):** All modern terminals support it. Allows arbitrary RGB for foreground, background, and the 256-color palette.
- **Good scheme properties:** (a) Minimum contrast ratio of 4.5:1 for foreground/background (WCAG AA), ideally 7:1 for text-heavy use. (b) Distinct colors for each of the 8 ANSI hues — red must not look like magenta, etc. (c) Selection and cursor colors should be distinct from text. (d) Dark themes dominate (lower eye strain), but light themes should be offered. [Source](https://neovim.io/doc/user/dev_theme/)
- **Neovim guidelines:** "green-blue feel" brand colors, true-color first, 16-color fallback. Minimum contrast ratio as per WCAG AA. [Source](https://neovim.io/doc/user/dev_theme/)
- **Popular themes:** Nord (cool blue-grey), Solarized (warm distinct colors), Catppuccin (pastel), One Dark (Atom-inspired), Dracula, Tokyo Night. kitty ships with 200+ themes via `kitty +kitten themes`.
- **SMUI design philosophy** (for terminal-inspired UIs): "Terminal-grade readability" — monospace fonts, high contrast, disciplined color use. [Source](https://github.com/statico/smui/blob/main/AESTHETIC.md)

#### 2.5 Scrollbar Design

- **Three approaches observed across terminals:**
  1. **Native OS scrollbar:** Ghostty on macOS uses native `NSScrollView` scrollbars, respecting system appearance settings (always/automatic/when-scrolling). Proposed for GTK. [Source](https://github.com/ghostty-org/ghostty/issues/9232) [Source](https://github.com/ghostty-org/ghostty/issues/111)
  2. **Minimal overlay scrollbar:** Alacritty's approach — three modes: Never (default), Fading (semi-transparent overlay, appears on scroll then fades), Always (reserves space). Non-interactive, purely visual. [Source](https://github.com/alacritty/alacritty/pull/7231)
  3. **Hidden / CSS-only:** Web terminals like Tabby use `::-webkit-scrollbar` CSS to style or hide. Users generally prefer macOS-style minimal overlays. [Source](https://github.com/Eugeny/tabby/issues/5321)
- **Best practice for web terminals:** Fading overlay scrollbar (appears on scroll, fades after ~1.5s idle) with 4-6px width, rounded thumb. Never interactive — terminal text selection conflicts with scrollbar dragging.
- **xterm.js v6:** Integrated scrollbar from VS Code codebase, with top/bottom border overview ruler options. [Source](https://github.com/xtermjs/xterm.js/releases/tag/6.0.0)

#### 2.6 Tab Bar Design Patterns

- **Position:** Top tabs are universal in terminal emulators. WezTerm supports `tab_bar_at_bottom = true` as an option, but it's off by default. VS Code puts terminal tabs on the right side of the terminal panel (side tabs) to save vertical space — hide when only one terminal, show when 2+. [Source](https://github.com/microsoft/vscode-docs/blob/c775dd9b/docs/terminal/appearance.md) [Source](https://wezterm.org/config/lua/config/tab_bar_at_bottom.html)
- **Warp Vertical Tabs:** Warp introduced a vertical tabs sidebar (replacing horizontal tab bar) showing rich metadata: Git branch, working directory, agent conversation status, diff stats. This is a departure from terminal convention but adds power-user value. [Source](https://docs.warp.dev/terminal/windows/vertical-tabs)
- **Activity Indicators (critical UX pattern):**
  - **tmux:** Three tab states — normal (unselected), current (selected), activity (output in background tab). `window-status-activity-style` for styling. [Source](https://github.com/tmux/tmux/issues/3927)
  - **iTerm2:** "Badges" in top-right corner showing git branch, hostname. Status bar with context. Unread count/bell indicators. [Source](https://iterm2.com/documentation-badges.html)
  - **Windows Terminal:** Bell indicator (exclamation mark), progress ring, zoom indicator. Settings for `notifyOnInactiveOutput` and `notifyOnNextPrompt` to flash taskbar or play sound when background tabs have output. [Source](https://github.com/microsoft/terminal/pull/20014) [Source](https://www.github.com/microsoft/terminal/issues/1620)
  - **Warp:** Tab color coding — green when process running, red when stopped/failed. Visual cue without switching tabs. `Indicators` for long-running commands, optional elapsed time display. [Source](https://github.com/warpdotdev/Warp/issues/4166) [Source](https://github.com/warpdotdev/Warp/issues/8711)
  - **Web terminal implication:** Activity indicators (dot, color change, icon badge) are _essential_ for multi-tab web terminals. Users with 7+ tabs lose track of what's running. A green/orange/red dot system plus a bell indicator for new output covers the main use cases.
- **Tab context menus:** GNOME HIG recommends right-click context menus on tabs with Close, Move to New Window, and additional actions. [Source](https://developer.gnome.org/hig/patterns/nav/tabs.html)

---

### 3. Web Terminal Libraries Comparison

#### 3.1 xterm.js (v6.0 — Dec 2025, v7.0 — in progress)

- **v6.0 features:** Removed Canvas renderer (breaking — WebGL or DOM only now). Synchronized output support (DEC mode 2026). Shadow DOM support in WebGL renderer. Detailed ligatures and variants. Progress addon. Reflow cursor line option. Integrated VS Code scrollbar. Top/bottom border overview ruler. [Source](https://github.com/xtermjs/xterm.js/releases/tag/6.0.0)
- **v7.0 (in dev, ~97% complete):** Kitty graphics protocol MVP merged into `@xterm/addon-image` (Feb 2026). Kitty keyboard protocol improvements (macOS Option+key fix, lock key handling). Image viewport fitting improvements. [Source](https://github.com/xtermjs/xterm.js/milestone/81)
- **`@xterm/addon-image` v0.9.0:** Supports Sixel + iTerm2 inline images. Kitty graphics protocol added in master (Feb 2026 merge). npm v0.9.0 does NOT yet include Kitty support (confirmed via npm listing + GitHub master). [Source](https://www.npmjs.com/package/@xterm/addon-image) [Source](https://github.com/xtermjs/xterm.js/issues/5592)
- **Performance:** WebGL renderer is ~6× faster than old Canvas renderer. GPU usage issues reported in VS Code/Cursor at ~1250fps drawing, causing whole-machine lag. The DOM renderer is being optimized (letter-spacing approach, cell merging). [Source](https://github.com/xtermjs/xterm.js/issues/5447) [Source](https://github.com/xtermjs/xterm.js/pull/4605)
- **Stars:** 20,377. By far the most-used web terminal library. Used in VS Code, Cursor, GitPod, CodeSandbox, etc.

#### 3.2 react-term (new competitor, 2025-2026)

- **Architecture:** React + Web Workers + SharedArrayBuffer + WebGL2. VT parser in Web Worker, rendering on OffscreenCanvas. Zero-copy cell grid shared via SAB. Alpha-only glyph atlas with shader color multiplication. Table-driven VT parser (14×256 lookup table). [Source](https://github.com/rahulpandita/react-term)
- **Multi-pane:** Single shared WebGL context with `gl.scissor()` per pane — bypasses Chrome's 16-context limit. Supports 2, 4, 8, 16, 32 concurrent panes.
- **Benchmarks vs xterm.js:** 120 FPS vs 82 FPS, 0 dropped frames vs 295, 1,456 MB processed vs 383 MB, 4.8ms loop latency vs 16.1ms. Uses frame-time percentiles (p50/p90/p99) instead of FPS to avoid penalizing correct batch rendering. [Source](https://github.com/rahulpandita/react-term) (comparison app README)
- **Features:** Full VT100/ANSI, Kitty keyboard protocol, bracketed paste, synchronized output (DEC 2026), OSC 52/4/104/8/7/133, wide char/CJK support, SearchAddon (regex), WebLinksAddon, FitAddon.
- **Status:** MIT license, active development with CI benchmarks. React + React Native support.

#### 3.3 wterm (Vercel Labs, 2025)

- **Architecture:** DOM-based rendering (real text nodes, CSS styling). Core VT parser written in Zig, compiled to ~12KB WASM. Renders to HTML DOM — native text selection, copy/paste, Ctrl+F, screen readers work for free. [Source](https://wterm.dev/) [Source](https://toolhunter.cc/tools/wterm)
- **Tradeoff:** DOM rendering is slower than canvas for bulk output but provides built-in accessibility and text selection. Zig WASM parser is extremely small and fast.
- **Integrations:** React, Vue, vanilla JS.
- **Status:** Actively developed by Vercel Labs. No Kitty graphics protocol yet.

#### 3.4 ghostty-web (humanlayer, 2025)

- **Architecture:** Ghostty's production-tested VT100 parser compiled to WASM. Canvas rendering at 60 FPS. Full xterm.js-compatible API surface. [Source](https://github.com/humanlayer/ghostty-web)
- **Status:** "Beta" quality. Used as a drop-in xterm.js replacement with a better parser.

#### 3.5 Comparison Summary

| Feature        | xterm.js v6/v7   | react-term        | wterm           | ghostty-web    |
| -------------- | ---------------- | ----------------- | --------------- | -------------- |
| Renderer       | WebGL / DOM      | WebGL2 / Canvas2D | DOM             | Canvas         |
| Parser         | TS (main thread) | TS (Web Worker)   | Zig WASM        | Zig WASM       |
| Ligatures      | Yes (v6)         | Yes               | Via font        | Limited        |
| Kitty Graphics | In master (v7)   | Not yet           | No              | No             |
| Sixel          | Yes (addon)      | Not yet           | No              | No             |
| Synced Output  | Yes (v6)         | Yes               | No              | No             |
| Multi-pane     | No               | Yes (shared ctx)  | No              | No             |
| React          | Wrapper needed   | Native            | Via integration | Wrapper needed |
| Bundle size    | ~500KB           | ~12KB WASM + JS   | ~12KB WASM      | ~200KB WASM    |

---

### 4. TUI Application Rendering

#### 4.1 ANSI Cursor Positioning in Complex TUIs

- **Codex CLI (OpenAI):** Uses a custom TUI framework (Rust, ratatui-derived) with explicit cursor position tracking per frame. `Frame` struct has `cursor_position: Option<Position>` — the renderer sets cursor position after drawing. Issues observed: cursor jumps between UI regions in Tabby/Wave terminals; cursor blink speeds up during frequent redraws on Windows Terminal. [Source](https://github.com/openai/codex/blob/main/codex-rs/tui/src/custom_terminal.rs) [Source](https://github.com/openai/codex/issues/17823)
- **pi TUI (badlogic):** Differential rendering with three strategies to minimize writes. Uses CSI 2026 (synchronized output) for atomic screen updates — eliminates flicker. Bracketed paste mode with markers for large pastes. Component-based architecture. [Source](https://github.com/badlogic/pi-mono/blob/a3bf1eb3/packages/tui/README.md)
- **Key challenges for web terminals rendering TUIs:**
  - Cursor positioning via ANSI sequences must be honored precisely (CUH, CUF, CUP, etc.)
  - Cursor blink rate management — frequent redraws should not reset blink phase
  - Synchronized output (DEC 2026: `CSI ? 2026 h` / `CSI ? 2026 l`) must gate rendering to prevent partial frame display
  - Alternate screen buffer (smcup/rmcup) switching must be instant
  - Mouse reporting protocols (SGR, URXVT, X10) need full support

#### 4.2 Kitty Graphics Protocol Support

- **Protocol:** APC-based escape sequences. Images transmitted as base64-encoded PNG/RGB/RGBA with chunking (`m=1` for continuation). Supports placements, z-index, virtual placements, and animation frames. [Source](https://terminfo.dev/extensions/kitty-graphics-protocol)
- **Adoption status:**
  - **kitty:** Full reference implementation
  - **Ghostty:** Supported but with ongoing improvements (tracking issue for performance, virtual placements) [Source](https://github.com/ghostty-org/ghostty/issues/8272)
  - **WezTerm:** Full support (parsing, placement, display) — tracking issue #986 shows all checkboxes marked [Source](https://github.com/wezterm/wezterm/issues/986)
  - **xterm.js / VS Code:** Merged Feb 2026 into `@xterm/addon-image`. VS Code enabled it in Feb 2026 stable. [Source](https://github.com/xtermjs/xterm.js/commit/3a9bfa94bc41fb3f53b8926392d9cab854cab867) [Source](https://github.com/microsoft/vscode/issues/295701)
  - **Windows Terminal:** Not supported (uses Sixel + its own image protocol)
  - **iTerm2:** Uses its own `imgcat` protocol, not Kitty protocol

#### 4.3 Sixel Support

- **Protocol:** DCS-based bitmap format (DEC VT240, 1983). Each character encodes a column of 6 vertical pixels. Uses `ESC P q ... ESC \`. [Source](https://terminfo.dev/extensions/sixel-graphics)
- **Adoption:** Windows Terminal (merged Jul 2024), WezTerm, xterm.js (addon-image v0.9.0), Ghostty (not supported per Silvery matrix), kitty (not supported — Kitty protocol instead). [Source](https://silvery.dev/reference/terminal-matrix.html) [Source](https://github.com/microsoft/terminal/pull/17421)
- **Web terminal note:** Sixel + Kitty protocol + iTerm2 protocol together cover all image display use cases. For a web terminal, Kitty protocol is the most modern and widely-adopted, with Sixel as legacy support.

#### 4.4 Terminal Compatibility Matrix (from Silvery, verified 2026-03)

| Terminal         | True Color | Kitty Gfx | Sixel | OSC 52 | Hyperlinks | Sync Output | Unicode |
| ---------------- | ---------- | --------- | ----- | ------ | ---------- | ----------- | ------- |
| Ghostty          | 24-bit     | Yes       | No    | Yes    | Yes        | Yes         | Yes     |
| kitty            | 24-bit     | Yes       | No    | Yes    | Yes        | Yes         | Yes     |
| WezTerm          | 24-bit     | Yes       | Yes   | Yes    | Yes        | Yes         | Yes     |
| iTerm2           | 24-bit     | No        | Yes   | Yes    | Yes        | Yes         | Yes     |
| Windows Terminal | 24-bit     | No        | Yes   | Yes    | Yes        | No          | Yes     |
| Alacritty        | 24-bit     | No        | No    | Yes    | Yes        | No          | Yes     |
| Warp             | 24-bit     | No        | No    | Yes    | Yes        | No          | Yes     |

[Source](https://silvery.dev/reference/terminal-matrix.html)

---

### 5. Consolidated Design Recommendations for Web Terminal

Based on all findings, a web terminal aiming for native feel should:

1. **Shortcuts:** Implement the macOS `Cmd+` convention as primary, with `Ctrl+Shift+` as Linux/Windows fallback. Support `Cmd+1-9` tab switching, `Cmd+D`/`Cmd+Shift+D` splits, `Cmd+F` search, `Cmd+=`/`Cmd+-`/`Cmd+0` font sizing.
2. **Activity indicators:** Use a 3-dot system on tabs: green (running), orange (output in background), red (process exited/failed). Include bell indicator (exclamation) for beeps in background tabs.
3. **Scrollbar:** Fading overlay scrollbar (4-6px, rounded, appears on scroll/wheel, fades after 1.5s). Never interactive (conflicts with text selection).
4. **Tab bar:** Top-positioned horizontal tabs. Hide when only one session (VS Code pattern). Context menu on right-click.
5. **Rendering:** WebGL2 canvas with glyph atlas for performance. Keep DOM overlay for accessibility (ARIA live region). Synchronized output (DEC 2026) for flicker-free TUI rendering.
6. **Cursor:** Support all 6 DECSCUSR shapes. Default: blinking block. Honor application cursor shape changes (vim modes).
7. **Image support:** Prioritize Kitty graphics protocol (modern, widely adopted), add Sixel as fallback for legacy compatibility.
8. **Color scheme:** Provide dark+light themes. Minimum 4.5:1 contrast ratio. Distinct ANSI 16-color palette. Ship with Nord, Catppuccin, Solarized Dark, One Dark as presets.

---

## Sources

### Kept

- **ghostty.org/docs/config/keybind/reference** — Complete Ghostty keybinding action reference (authoritative)
- **sw.kovidgoyal.net/kitty/invocation/** — Official kitty CLI docs with default shortcuts (authoritative)
- **github.com/kovidgoyal/kitty/issues/50** — kitty ligatures limitation explanation (primary source, author comment)
- **terminfo.dev/cursor/decscusr-cursor-shape** — DECSCUSR cursor standard reference
- **textcursor.com/faqs/** — Vim cursor mode conventions (editor behavior)
- **silvery.dev/reference/terminal-matrix.html** — Terminal feature compatibility matrix (last verified 2026-03)
- **github.com/xtermjs/xterm.js/releases/tag/6.0.0** — xterm.js v6 release notes (authoritative)
- **github.com/xtermjs/xterm.js/issues/5592** — Kitty graphics protocol implementation tracking (primary)
- **github.com/rahulpandita/react-term** — react-term README with benchmarks and architecture (primary)
- **wterm.dev/** — wterm official site with architecture docs (primary)
- **github.com/alacritty/alacritty/pull/7231** — Alacritty scrollbar design (Fading/Always/Never) (primary)
- **github.com/ghostty-org/ghostty/issues/9232** — Ghostty macOS native scrollbar implementation (primary)
- **github.com/microsoft/terminal/pull/20014** — Windows Terminal activity notification settings (primary)
- **github.com/openai/codex/blob/main/codex-rs/tui/src/custom_terminal.rs** — Codex TUI cursor handling source (primary)
- **github.com/badlogic/pi-mono** — pi TUI differential rendering approach (primary)
- **terminfo.dev/extensions/kitty-graphics-protocol** — Kitty protocol technical spec (authoritative)
- **docs.warp.dev/terminal/windows/vertical-tabs** — Warp vertical tabs design (primary)

### Dropped

- Various SEO-aggregator terminal comparison blogs — regurgitated content without primary data
- Older xterm.js performance PRs (v4-era) — superseded by v6/v7 data
- General "best terminal emulator 2025" listicles — broad, not UX-specific
- Nick Babich mobile bottom tab bar article — mobile-focused, not applicable to terminal desktop UX
- SMUI aesthetic guide — interesting but specific to a CSS framework, not terminal conventions

---

## Gaps

1. **Accessibility patterns for web terminals:** No deep research on screen reader integration, focus management, or keyboard navigation patterns for terminal UI chrome (tab bar, menus). This deserves its own research brief.
2. **Touch/gesture conventions:** Native terminals have limited touch support. Mobile/tablet web terminal UX (touch selection, pinch-zoom, virtual keyboard) not covered.
3. **Actual latency benchmarks for web terminals:** react-term provides comparison numbers vs xterm.js, but independent third-party benchmarks (e.g., typescript-vs-rust WASM parser throughput) would strengthen recommendations.
4. **Font rendering quality comparison:** No side-by-side analysis of how each rendering approach (DOM vs Canvas vs WebGL) affects font quality, kerning, and CJK rendering at different sizes.
5. **Warp's AI integration UX patterns:** Warp has unique AI command-block UI that may influence future terminal design trends — not evaluated here.

---

## Supervisor coordination

No blocking decisions needed. Research is self-contained and provides evidence-backed findings for all four topics requested. Ready for handoff.
