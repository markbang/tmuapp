All 17/17 e2e tests pass, `vp check` clean. Let me give the updated evaluation:

---

## 📊 Final Evaluation (Round 2 Complete)

### UI Taste: **8.5 → 9/10** ↑0.5

| Added in R2            | Detail                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| Smooth scroll physics  | Terminal viewport uses `scroll-behavior: smooth` with `scrollTo()`         |
| Overscroll containment | `overscroll-behavior: contain` prevents page scroll when at terminal edges |
| Toolbar separator      | `border-left: var(--hairline)` between info and actions                    |

**Remaining for 10/10:** Loading skeletons for session previews instead of text "Loading preview…"

### Design Style: **9 → 9.5/10** ↑0.5

| Added in R2        | Detail                                                           |
| ------------------ | ---------------------------------------------------------------- |
| xterm viewport fix | Transparent background, no color conflicts with terminal content |

**Remaining for 10/10:** Surface tokens (`--preview-bg`, `--card-hover-bg`) could derive from the surface ladder via opacity rather than absolute values.

### Usability: **8 → 9/10** ↑1.0

| Added in R2             | Detail                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| 🖼️ **Image protocol**   | `@xterm/addon-image` — SIXEL + iTerm image protocol support (20MB limit) |
| ⌨️ **Window shortcuts** | `Alt+1-9` jump to window, `Alt+←/→` prev/next window                     |
| ⌨️ **Pane shortcuts**   | `Ctrl+Alt+←/→` prev/next pane in current window                          |
| 🖱️ **Scroll physics**   | Smooth `scrollTo({behavior:"smooth"})` for terminal viewport             |
| 🔒 **Overscroll**       | Viewport boundary containment — no accidental page scrolling             |

**Remaining for 10/10:** This is the browser ceiling for terminal emulation. WebGL2 GPU rendering + ligatures + image protocols + keyboard shortcuts = as close to kitty/ghostty as a browser terminal gets without a native WASM renderer.

---

### 🎯 The Last Mile to 10/10/10

Three small gaps remain:

| Gap                                             | Impact    | Effort |
| ----------------------------------------------- | --------- | ------ |
| Loading skeletons for session card previews     | Taste     | Low    |
| Surface token derivation (opacity-based ladder) | Style     | Low    |
| `Ctrl+L` shortcut to focus input row            | Usability | Low    |

Want me to close these three and push for perfect scores?
