# VS Code Web Terminal Parity Evaluation: Focus, Selection, Keyboard

Scope: evaluated `apps/website/src/main.tsx`, `apps/website/src/terminal/terminal-adapter.ts`, and `apps/website/src/styles/terminal.css` against the requested VS Code web terminal behaviors.

## Focus & Selection: 9/10

### What matches VS Code well

- **Visible focus border/glow is implemented.** The terminal wrapper gets a primary border and 2px glow when xterm has focus via `.terminal-wrap:has(.xterm.focus)` (`apps/website/src/styles/terminal.css:508-512`).
- **Unfocused cursor style is implemented.** xterm is configured with `cursorInactiveStyle: "outline"` (`apps/website/src/terminal/terminal-adapter.ts:41-44`).
- **Colored selection is implemented.** The xterm theme sets `selectionBackground: "#264f78"` (`apps/website/src/terminal/terminal-adapter.ts:61-67`), and CSS overrides xterm selection to lavender (`apps/website/src/styles/terminal.css:518-520`).
- **Auto-copy on selection is implemented.** `term.onSelectionChange()` copies `term.getSelection()` to the clipboard and flashes the terminal (`apps/website/src/terminal/terminal-adapter.ts:182-190`).
- **Double-click word selection should work via xterm defaults, with explicit word boundaries.** The terminal sets `wordSeparator` (`apps/website/src/terminal/terminal-adapter.ts:52-60`), which is the xterm option used for word selection behavior.
- **Context menu supports selection operations.** Copy is disabled when no terminal selection exists, Paste uses clipboard text, and Select All calls xterm `selectAll()` (`apps/website/src/main.tsx:1279-1330`).

### Gaps / risks preventing 10

- **Focus glow depends on CSS `:has()`.** This is fine in modern Chromium/Safari/Firefox, but it is still a browser-selector dependency rather than an explicit React focus state (`apps/website/src/styles/terminal.css:508-512`).
- **Double-click word selection is implicit, not explicitly wired or tested in these files.** It likely works because xterm supports it and `wordSeparator` is set, but there is no local handler or evidence of test coverage in the inspected files.
- **Auto-copy fires on every selection change.** This matches the requested behavior, but it may be more aggressive than VS Code/default browser terminal behavior and can fail silently if clipboard permission is denied (`apps/website/src/terminal/terminal-adapter.ts:184-188`).

## Keyboard & Input: 8/10

### What matches VS Code well

- **Raw terminal input path is correct for standard terminal keys.** The adapter uses `term.onData(options.onData)` only, with no duplicate `onKey` forwarding. The code comments explicitly state that onData covers printable chars, Ctrl+A..Z, Tab, Backspace, arrows, Home/End, and F-keys (`apps/website/src/terminal/terminal-adapter.ts:88-95`). This should cover Ctrl+C/D/Z, arrows, Home/End, PgUp/PgDn, Tab, Esc, Enter, and Backspace when xterm has focus.
- **Search shortcut exists.** Cmd+F and Ctrl+Shift+F toggle the terminal search UI (`apps/website/src/main.tsx:786-793`). Search input supports Escape to close/refocus terminal and Enter / Shift+Enter for next/previous match (`apps/website/src/main.tsx:1158-1181`).
- **Font size shortcuts exist.** Cmd/Ctrl `=`, `+`, `-`, and `0` adjust/reset font size, persist the value, and refit the terminal (`apps/website/src/main.tsx:796-837`).
- **Tab/window switching exists.** Alt+1..9 switches windows (`apps/website/src/main.tsx:720-733`), Alt+Left/Right switches windows (`apps/website/src/main.tsx:735-752`), and Ctrl+Alt+Left/Right switches panes (`apps/website/src/main.tsx:755-772`).
- **Escape behavior is mostly correct.** Escape closes the context menu if open (`apps/website/src/main.tsx:701-706`); otherwise, because xterm’s helper textarea is exempted from the form-control early return (`apps/website/src/main.tsx:710-718`), Escape should continue through xterm when focused.

### Gaps / risks preventing 10

- **Some shell/application keybindings are stolen globally.** Alt+1..9 and Alt+Left/Right are intercepted for tmux window switching whenever the active element is not a normal form control (`apps/website/src/main.tsx:720-752`). That means terminal programs/shells cannot receive those Meta/Alt sequences. VS Code is more careful about which workbench keybindings skip the shell.
- **Ctrl+Alt+Left/Right is also stolen for pane switching** (`apps/website/src/main.tsx:755-772`). This is useful for tmuapp navigation, but it is another terminal-input conflict.
- **Ctrl+L is repurposed away from the shell.** Instead of sending the standard clear-screen key to the terminal, Ctrl+L focuses/selects the separate pane input line (`apps/website/src/main.tsx:774-783`). This is a clear mismatch with VS Code terminal behavior and normal terminal expectations.
- **Tab switching keymap differs from VS Code.** tmuapp has Alt-based window switching and Ctrl+Alt pane switching, but not the common VS Code terminal tab navigation shortcuts such as Ctrl/Cmd+PageUp/PageDown or Cmd+Shift+[`] / Cmd+Shift+[`[`] variants.
- **Correctness for PgUp/PgDn is inherited from xterm, not explicitly handled here.** That is probably fine, but the inspected code does not show explicit tests or browser-level prevention for page scrolling beyond xterm’s normal focus behavior.

## Summary

- **Focus & Selection: 9/10** — visually and functionally close to VS Code; main remaining gaps are implicit double-click coverage and reliance on CSS `:has()` / clipboard permission behavior.
- **Keyboard & Input: 8/10** — core terminal key passthrough is strong through xterm `onData`, and search/font/tab shortcuts exist. The main parity issues are global shortcut conflicts that steal shell keys, especially Ctrl+L and Alt/Ctrl+Alt arrow/number combinations.

## Suggested fixes to reach closer to 10

1. Stop intercepting **Ctrl+L**; let xterm send it to the shell. Move “focus pane input line” to a non-terminal shortcut such as Cmd/Ctrl+K or a toolbar button.
2. Make tmux window/pane switching shortcuts configurable, or require a tmuapp-specific prefix/chord so Alt/meta keys can still reach shell apps.
3. Add VS Code-like terminal tab navigation aliases: Ctrl/Cmd+PageUp/PageDown and/or Cmd+Shift+[`[`]/`]`, while avoiding conflicts with shell input where possible.
4. Add an E2E assertion for double-click word selection and for PgUp/PgDn / Home / End passthrough if not already covered elsewhere.
