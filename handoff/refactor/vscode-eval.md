# VS Code Web Terminal Replication Evaluation

Reviewed files:

- `apps/website/src/main.tsx`
- `apps/website/src/terminal/terminal-adapter.ts`
- `apps/website/src/styles/terminal.css`
- `apps/website/src/styles/components.css`
- `apps/website/src/design/README.md`

Strict baseline: VS Code/vscode.dev integrated terminal UX, not just xterm.js availability.

## Scores

| Dimension            | Score |
| -------------------- | ----: |
| 1. Search Widget     |  7/10 |
| 2. Context Menu      |  6/10 |
| 3. Focus & Selection |  8/10 |
| 4. Keyboard & Input  |  6/10 |
| 5. Visual Polish     |  7/10 |

## 1. Search Widget — 7/10

What is good:

- Compact inline bar exists at `apps/website/src/main.tsx:1133-1244` with input, previous/next buttons, Aa/Ab/`.*` toggles, and close button.
- Live-as-you-type search is implemented via `findNext` in `onChange` at `apps/website/src/main.tsx:1140-1149`.
- Enter and Shift+Enter navigation are implemented at `apps/website/src/main.tsx:1157-1174`.
- Escape closes search and returns focus to the terminal at `apps/website/src/main.tsx:1151-1156`.
- Styling is compact and VS Code-like at `apps/website/src/styles/terminal.css:173-229`.

Missing/subpar:

1. No match count (`"3 of 12"`). The UI has no state for result index/count and renders no count element in `apps/website/src/main.tsx:1133-1244`.
   - Recommendation: use `@xterm/addon-search` result callbacks/events if available in the installed version, or wrap `findNext/findPrevious` return values and terminal buffer scanning to maintain `{ current, total }`; render a small `.search-count` between input and arrows.
2. Toggling Aa/Ab/`.*` does not immediately re-run the current search. The toggle handlers only update state at `apps/website/src/main.tsx:1210`, `apps/website/src/main.tsx:1219`, and `apps/website/src/main.tsx:1228`.
   - Recommendation: create a shared `runSearch(direction, overrides)` helper and call it after each toggle using the next option values.
3. Ctrl/Cmd+F search shortcut likely does not fire while xterm itself is focused because the global shortcut handler returns for any focused `HTMLTextAreaElement` at `apps/website/src/main.tsx:704-710`; xterm uses a hidden textarea for input.
   - Recommendation: change the guard to ignore normal app form controls but allow xterm's helper textarea, e.g. skip only if `active.closest('.terminal')` is false or if `active.name === 'pane-input'`.
4. No invalid-regex/no-results visual state. The search input remains normal even if regex is invalid or no result is found (`apps/website/src/main.tsx:1140-1149`).
   - Recommendation: track search result status and add `.terminal-search input.no-results` styling similar to VS Code's red/contrast indication.

## 2. Context Menu — 6/10

What is good:

- Right-click opens a terminal-specific menu at `apps/website/src/main.tsx:1247-1254`.
- Menu contains Copy, Paste, and Select All at `apps/website/src/main.tsx:1274-1311`.
- Dark theme and lavender hover are implemented at `apps/website/src/styles/terminal.css:425-455`.
- Escape closes the menu at `apps/website/src/main.tsx:695-700`.

Missing/subpar:

1. Copy is not disabled when there is no selection. It always renders an enabled button at `apps/website/src/main.tsx:1274-1285`, then silently does nothing if selection is empty.
   - Recommendation: maintain `hasTerminalSelection` via `term.onSelectionChange` in `terminal-adapter.ts` or expose `getSelection()` on `TermAdapter`; render `disabled={!hasTerminalSelection}` and style disabled buttons.
2. Menu does not close on outside click. The only click handler closes when the menu itself is clicked at `apps/website/src/main.tsx:1267-1272`.
   - Recommendation: add a document-level `pointerdown` listener while `contextMenu` is open; close if the event target is outside `.terminal-context-menu`.
3. Menu is not clamped to viewport. It uses raw `clientX/clientY` at `apps/website/src/main.tsx:1251-1254` and fixed coordinates at `apps/website/src/main.tsx:1267-1270`, so it can overflow at screen edges.
   - Recommendation: compute `left/top` after measuring menu dimensions or clamp against `window.innerWidth/innerHeight` with an estimated min width/height.
4. No keyboard navigation/focus management. `role="menu"` is present at `apps/website/src/main.tsx:1272`, but menu items lack `role="menuitem"`, initial focus, arrow-key navigation, and Enter activation.
   - Recommendation: focus the first enabled menu item on open, add `role="menuitem"`, and implement ArrowUp/ArrowDown/Home/End/Escape behavior.

## 3. Focus & Selection — 8/10

What is good:

- Visible focus indicator exists on xterm and wrapper at `apps/website/src/styles/terminal.css:99-102` and `apps/website/src/styles/terminal.css:457-465`.
- Inactive cursor style is configured as outline at `apps/website/src/terminal/terminal-adapter.ts:40-42`.
- Lavender selection CSS exists at `apps/website/src/styles/terminal.css:111-114` and `apps/website/src/styles/terminal.css:467-470`.
- Auto-copy on selection is implemented at `apps/website/src/terminal/terminal-adapter.ts:176-184`.
- Word selection has a VS Code-like separator configured at `apps/website/src/terminal/terminal-adapter.ts:58`; xterm's built-in double-click selection should use this.

Missing/subpar:

1. Selection color is inconsistent for WebGL/canvas paths. The xterm theme still sets `selectionBackground: "#264f78"` at `apps/website/src/terminal/terminal-adapter.ts:65`, while CSS forces lavender at `apps/website/src/styles/terminal.css:111-114` and `apps/website/src/styles/terminal.css:467-470`. With WebGL, theme selection may win over CSS.
   - Recommendation: set `selectionBackground` in the xterm theme to the same lavender value used by the CSS, preferably via a CSS token read from computed style.
2. Focus CSS is duplicated/overridden: `.terminal .xterm.focus` first sets an outline at `apps/website/src/styles/terminal.css:99-102`, then later removes it at `apps/website/src/styles/terminal.css:463-465`.
   - Recommendation: consolidate into one focus strategy. Keep wrapper glow only if that is the intended VS Code-like indicator.
3. Auto-copy fires on every selection change at `apps/website/src/terminal/terminal-adapter.ts:178-184`; this can spam clipboard writes during drag selection.
   - Recommendation: debounce until selection settles or copy on mouseup/selection complete. Keep the flash confirmation only after a successful clipboard write.

## 4. Keyboard & Input — 6/10

What is good:

- xterm `onData` is the single raw input path, avoiding double-send, at `apps/website/src/terminal/terminal-adapter.ts:87-94`.
- Raw terminal data is sent over the WebSocket when open at `apps/website/src/main.tsx:490-500`, so Ctrl+C/D/Z, arrows, Home/End, PageUp/Down, Tab, Escape, Enter, and Backspace should be forwarded through xterm's normal key handling.
- Font size shortcuts are implemented at `apps/website/src/main.tsx:789-831`.
- Alt+1-9 window switching is implemented at `apps/website/src/main.tsx:713-726`.
- Ctrl+L focuses the pane input row at `apps/website/src/main.tsx:767-776`.

Missing/subpar:

1. Global shortcuts likely do not work while the terminal is actually focused. The handler returns for `HTMLTextAreaElement` at `apps/website/src/main.tsx:704-710`; xterm focuses a hidden textarea, so Ctrl+Shift+F, Cmd/Ctrl font-size shortcuts, Alt+1-9, and Ctrl+L can be swallowed/forwarded instead of handled.
   - Recommendation: distinguish xterm's helper textarea from app form inputs. For example, allow shortcuts when `active.closest('.terminal')` is true, and only return early for `.pane-input`, dialogs, token inputs, and other app controls outside the terminal.
2. Search open shortcut is incomplete relative to VS Code. Code supports Cmd+F and Ctrl+Shift+F at `apps/website/src/main.tsx:779-786`, but not plain Ctrl+F on non-macOS.
   - Recommendation: add Ctrl+F where it does not conflict with browser find, or intentionally document Ctrl+Shift+F only. VS Code web commonly intercepts browser-style find for its widgets.
3. The bottom input row remains a separate command sender at `apps/website/src/main.tsx:1315-1356`, which is not VS Code terminal behavior and competes with direct terminal input.
   - Recommendation: keep it if it is product-specific, but visually and behaviorally de-emphasize it or make it optional; VS Code-like terminal should make xterm direct input the primary path.
4. Fallback HTTP input at `apps/website/src/main.tsx:503-509` sends raw data through `/input`; if the WebSocket is unavailable, complex key sequences/control shortcuts may not be equivalent to xterm/PTY behavior.
   - Recommendation: when offline from the stream, map key/control sequences through the same `/keys` endpoint where possible or disable direct terminal typing until stream reconnects.

## 5. Visual Polish — 7/10

What is good:

- The design contract is strong and appropriate: black cockpit, precise hairlines, and one lavender accent are documented at `apps/website/src/design/README.md:5-13`.
- Terminal surface is clean and near-black at `apps/website/src/styles/terminal.css:58-87`.
- xterm padding is compact at `apps/website/src/styles/terminal.css:89-97`.
- WebGL, ligatures, images, Unicode 11, and web links are loaded at `apps/website/src/terminal/terminal-adapter.ts:122-170`, which is a strong foundation for VS Code-like rendering.
- Window/pane strips use consistent hairlines and spacing at `apps/website/src/styles/components.css:110-130`.

Missing/subpar:

1. No explicit scrollbar styling. Search found no `scrollbar`, `::-webkit-scrollbar`, or `scrollbar-color` rules; xterm viewport only sets behavior/background at `apps/website/src/styles/terminal.css:104-109`.
   - Recommendation: style `.terminal .xterm-viewport` scrollbars to match VS Code's thin dark scrollbar/hover thumb, including Firefox `scrollbar-color`.
2. The terminal is not as decoration-free as VS Code's panel terminal because the toolbar plus bottom input row occupy significant chrome (`apps/website/src/main.tsx:1066-1131` and `apps/website/src/main.tsx:1315-1356`).
   - Recommendation: add a focused "terminal-only" mode or collapse secondary controls behind compact buttons, keeping the terminal viewport dominant.
3. Raw hex colors are embedded in the xterm theme at `apps/website/src/terminal/terminal-adapter.ts:60-81`. The design system says to use CSS variables and avoid one-off hex colors in components at `apps/website/src/design/README.md:24-30`.
   - Recommendation: derive the xterm theme from CSS custom properties (`getComputedStyle(document.documentElement)`) or centralize terminal palette tokens.
4. `scroll-behavior: smooth` on the xterm viewport at `apps/website/src/styles/terminal.css:104-107` may feel less precise for terminal output than VS Code's terminal, where smooth scrolling is controlled carefully and can be disabled.
   - Recommendation: make smooth scrolling configurable or restrict it to user wheel/page scroll, not programmatic output-following.
5. Cursor blink is enabled at `apps/website/src/terminal/terminal-adapter.ts:40`, but blink interval/duration is not tuned to VS Code. This is minor but visible in side-by-side comparison.
   - Recommendation: set xterm blink timing if supported by the installed version, or leave default but do not claim indistinguishable parity.

## Highest-impact path to 9+/10

1. Fix the active-element guard so terminal shortcuts work while xterm is focused (`apps/website/src/main.tsx:704-710`).
2. Add real search match count and rerun search on option toggles (`apps/website/src/main.tsx:1133-1244`).
3. Add outside-click close, disabled Copy, and viewport clamping for the context menu (`apps/website/src/main.tsx:1267-1312`).
4. Unify selection color between xterm theme and CSS (`apps/website/src/terminal/terminal-adapter.ts:65`, `apps/website/src/styles/terminal.css:111-114`).
5. Add VS Code-like scrollbar styling and optionally a terminal-only/collapsed-chrome mode (`apps/website/src/styles/terminal.css`).
