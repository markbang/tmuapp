# VS Code Web Terminal Eval — Search Widget + Context Menu

## Search Widget

**Score: 8/10**

### What matches VS Code well

- Compact inline search bar is present in the terminal header area (`apps/website/src/main.tsx:1140-1256`).
- Live-as-you-type search is wired through `onChange` and immediately calls `findNext(...)` (`apps/website/src/main.tsx:1147-1156`).
- `Enter` goes to next result, `Shift+Enter` goes to previous, and `Escape` closes the widget (`apps/website/src/main.tsx:1158-1182`).
- Previous/next arrows are present (`apps/website/src/main.tsx:1189-1215`).
- Toggle buttons for case sensitivity, whole word, and regex are present with active styling (`apps/website/src/main.tsx:1217-1243`; `apps/website/src/styles/terminal.css:241-245`).

### Gaps vs vscode.dev

- **Match count format is not VS Code-like.** It renders as `index/count` instead of `3 of 12` (`apps/website/src/main.tsx:1184-1187`).
- **Toggling Aa / Ab / `.*` does not rerun the search immediately.** The buttons only flip local state (`apps/website/src/main.tsx:1217-1243`), and search is only re-executed from the input change / Enter / arrow handlers (`apps/website/src/main.tsx:1147-1182`).
- **Not a true VS Code-style overlay widget.** It is embedded in the terminal toolbar region rather than floating as a dedicated find widget (`apps/website/src/main.tsx:1140-1256`).

## Context Menu

**Score: 7/10**

### What matches VS Code well

- Right-click opens a dark menu with Copy / Paste / Select All (`apps/website/src/main.tsx:1263-1337`).
- Menu styling is close to VS Code: dark background, bordered panel, hover highlight, separators (`apps/website/src/styles/terminal.css:453-506`).
- Escape closes the menu (`apps/website/src/main.tsx:701-704`).
- Wheel interaction also closes it (`apps/website/src/main.tsx:1284-1288`).

### Gaps vs vscode.dev

- **No true outside-click close handler.** The menu closes on Escape, wheel, menu-background click, or after choosing an action, but there is no document-level pointer/mousedown handler to dismiss it when clicking elsewhere in the app (`apps/website/src/main.tsx:1279-1337`, especially `1284-1288` and `701-704`).
- **No keyboard navigation inside the menu.** The menu is a plain `div role="menu"` with buttons, but there is no roving focus, arrow-key navigation, or `menuitem` semantics (`apps/website/src/main.tsx:1280-1335`).
- **No viewport clamping / repositioning.** The menu is positioned directly at `clientX/clientY` (`apps/website/src/main.tsx:1280-1283`), so it can overflow off-screen near the window edges.

## Summary

- Search widget is quite close to VS Code, but the counter formatting and immediate re-search on toggle changes still differ.
- Context menu has the right actions and styling, but it still lacks VS Code-level dismissal, keyboard accessibility, and edge-aware positioning.
