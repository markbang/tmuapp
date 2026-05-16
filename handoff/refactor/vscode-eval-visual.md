## Visual Polish Review

**Score: 7.5 / 10**

The terminal UI is already much closer to VS Code's `vscode.dev` terminal than a typical custom app: it uses a restrained dark palette, consistent hairlines, compact chrome, and a focused lavender accent. The result is coherent with the product design contract in `apps/website/src/design/README.md:7-13,24-30,32-45`.

### Correct

- The dark "instrument panel" language is consistent across the terminal shell and surrounding chrome: near-black canvas/surfaces, 1px hairlines, and a single accent color are used throughout (`apps/website/src/styles/tokens.css:1-58`).
- The terminal area has a clear hierarchy: toolbar, terminal frame, and input row are separated with simple strokes rather than decorative effects (`apps/website/src/styles/terminal.css:1-19,58-66,275-299`).
- Focus and selection are visually deliberate: the terminal gains an accent border/shadow on focus and uses a lavender selection fill (`apps/website/src/styles/terminal.css:508-520`).
- The scrollbar treatment is cleaner than default browser chrome and is in the right direction for a VS Code-like feel (`apps/website/src/styles/terminal.css:104-129`).
- The shell uses xterm.js with GPU rendering and cursor settings that support a polished terminal feel (`apps/website/src/terminal/terminal-adapter.ts:40-66`).

### Gaps vs VS Code web terminal

1. **Font rendering is still tuned for speed, not polish.**
   - `text-rendering: optimizeSpeed` in `tokens.css` can trade crispness for throughput (`apps/website/src/styles/tokens.css:51-58`). VS Code's terminal feels more intentionally tuned for text clarity.

2. **Terminal padding is slightly asymmetrical.**
   - `.terminal .xterm` uses `padding: 6px 0 6px 10px` (`apps/website/src/styles/terminal.css:89-97`). VS Code's terminal framing feels more balanced and deliberate; the left-only inset reads a bit custom.

3. **Scrollbar polish is incomplete outside WebKit.**
   - The scrollbar styling only targets `::-webkit-scrollbar` variants (`apps/website/src/styles/terminal.css:111-129`). Firefox will fall back to native scrollbar styling, so the experience is not uniformly VS Code-like.

4. **Cursor treatment is functional, but not especially refined.**
   - The cursor is configured in xterm options, but there is no additional visual tuning beyond the default block cursor and focus outline (`apps/website/src/terminal/terminal-adapter.ts:41-43,61-66`; `apps/website/src/styles/terminal.css:99-102,508-516`). VS Code's cursor and focus states feel more integrated into the workbench chrome.

5. **The surrounding chrome is still more "app shell" than VS Code workbench.**
   - Rounded 8px cards, button radii, and panel shadows in `components.css` and `layout.css` make the overall cockpit slightly softer and more app-like than VS Code's flatter, denser workbench aesthetic (`apps/website/src/styles/components.css:22-35,110-158,164-171`; `apps/website/src/styles/layout.css:122-199`).

6. **Search/find chrome is close, but not yet workbench-grade.**
   - The terminal search bar has the right controls, but it still reads as a custom toolbar row rather than VS Code's tighter find widget proportions and spacing (`apps/website/src/styles/terminal.css:192-257`).

7. **No overview ruler / command-marker visual channel.**
   - VS Code's terminal has additional visual guidance for terminal state and history; our terminal styling stops at the viewport and scrollbar, so there is no analogous right-edge cue or ruler in the current CSS (`apps/website/src/styles/terminal.css:104-129`).

### Bottom line

This is already a solid, polished terminal shell, but it is not yet at VS Code's level of visual refinement. The main remaining work is not color choice; it is tightening typography/padding, making scrollbar behavior consistent across browsers, and reducing the amount of custom app-shell softness around the terminal so the whole experience feels more like a dense workbench and less like a styled dashboard.
