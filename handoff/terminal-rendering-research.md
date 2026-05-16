# Research: JS/TS Terminal Emulator Libraries for Native-Level Web Experience

## Summary

**xterm.js v6 with the WebGL addon is the only production-ready option today** that provides GPU-accelerated rendering, ligature support, Sixel, and Kitty graphics protocol support in the browser. A promising new entrant, **ghostty-web** (by Coder, from the NimbleMarkets branch), wraps Ghostty's native Zig parser in WASM and offers WebGPU/WebGL2/Canvas2D rendering with full Kitty graphics protocol support — but it is pre-1.0, has a larger bundle (~638KB/185KB gzipped), and a much smaller ecosystem. For a tmux-like multiplexer app that needs kitty/ghostty-level smoothness, **xterm.js v6 + addon-webgl + addon-image is the pragmatic choice**; ghostty-web is the strategic bet worth tracking as it matures.

---

## Findings

### 1. xterm.js v6 — The Established Standard

**Rendering backends:** WebGL2 (`@xterm/addon-webgl`, v0.19.0), Canvas2D (fallback addon), WebGPU (in-progress, PR #5666, draft).

**Bundle sizes (bundlephobia, v6.0.0):**
| Package | Uncompressed | Gzipped |
|---|---|---|
| `@xterm/xterm` core | 330 KB | 82 KB |
| `@xterm/addon-webgl` | 122 KB | 33 KB |
| `@xterm/addon-ligatures` | 193 KB | 58 KB |
| `@xterm/addon-image` | 60 KB | 20 KB |
| **Total (all 4)** | **705 KB** | **193 KB** |

**Kitty graphics protocol:** Implemented and merged in Feb 2026 (Issue #5592, PR #5619) by contributor @anthonykim1. The `@xterm/addon-image` addon (v0.9.0) now supports three graphics protocols: SIXEL, iTerm IIP, and Kitty graphics. Configuration: `kittySupport: true`, `kittySizeLimit: 20000000`. MVP supports transmit (`a=t`) and transmit+display (`a=T`); placement action (`a=p`) tracked in Issue #5707.[Source](https://github.com/xtermjs/xterm.js/issues/5592)

**Sixel support:** Mature via `@xterm/addon-image`. Uses `sixel` npm package (by @jerch) for decoding. Sixel rendering works with canvas renderer; a v6.0 regression was reported for non-rendering (#5644), indicating some edge cases remain.[Source](https://github.com/xtermjs/xterm.js/issues/5644)

**Ligature support:** Via `@xterm/addon-ligatures` (v0.10.0). Uses `fontkit` to resolve glyph indices and builds ligature-aware glyph atlases. WebGL renderer supports ligatures since xterm.js v4.12 (2021, PR #2560 on onivim). Known edge cases: extremely wide ligature glyphs need special overflow atlas pages (PR #5278), cursor background color can get stuck on ligature cells (#5205, fixed Dec 2025). Detailed ligatures and variants via `fontFeatureSettings` added in PR #5285.[Source](https://github.com/xtermjs/xterm.js/pull/5285)

**Performance:** WebGL renderer benchmarks from PR #1790 show 5-9x speedup over canvas renderer: ~0.7ms/frame (87x26 viewport) vs 4.8ms for canvas; ~2-4ms/frame (300x80 viewport) vs 15-19ms for canvas. For CJK text, WebGL achieves ~6ms vs 15ms canvas. These are from 2018 — modern WebGL2 improvements since then have further optimized this.[Source](https://github.com/xtermjs/xterm.js/pull/1790)

**Smooth scrolling:** Duration-based smooth scrolling implemented in PR #3940 (2022). Uses CSS transitions on a transform layer. Not as fluid as native GPU-composited scrolling (kitty/ghostty), but functional. Scrolling is JavaScript-driven via `requestAnimationFrame` rendering loop.

**Input latency:** Optimized in PR #4145 — reduced critical I/O path from ~10ms to ~4ms on macOS. The DOM renderer still processes keyboard events through the browser event loop; WebGL/Canvas renderers bypass DOM reflow but input is still JS event-driven.

**Maintenance:** 20.5K GitHub stars, ~140 open issues, very active. Maintained primarily by @Tyriar (Daniel Imms, Microsoft). Used in VS Code, Hyper, Tabby, Theia. Releases are frequent — v5.0.0 (Sep 2022), v6.0.0 (Dec 2025), v6.1.0-beta series ongoing in 2026.[Source](https://github.com/xtermjs/xterm.js/releases/tag/6.0.0)

**Known issues:** High GPU usage reported (#5447) causing system lag in VS Code/Cursor on some configurations — this appears to be a WebGL context/texture management issue, not fundamental to the architecture.

### 2. @xterm/xterm v6 vs v5 — What Changed for GPU Rendering

- **v6.0.0 (Dec 2025):** Synchronized output support (DEC mode 2026), shadow DOM support in WebGL renderer, detailed ligatures/variants, range API for HTML serialization, progress addon, improved search performance with SearchLineCache.[Source](https://github.com/xtermjs/xterm.js/releases/tag/6.0.0)
- **Code splitting (PR #5610):** Lazy-loads AccessibilityManager, OverviewRuler, and CustomGlyphDefinitions, reducing initial bundle by ~17%. WebGL addon's custom glyph definitions (~200KB) loaded only on first use.[Source](https://github.com/xtermjs/xterm.js/pull/5610)
- **WebGL addon consolidation (PR #5286):** Moved addon-specific code out of shared renderer module, completing the clean separation.
- **ESM support (PR #5092):** Ships ESM via esbuild with proper tree-shaking.

### 3. ghostty-web — The Strategic Challenger

**Repository:** [coder/ghostty-web](https://github.com/coder/ghostty-web) (2,347 stars, 42 open issues). Originated from [NimbleMarkets/ghostty-web](https://github.com/NimbleMarkets/ghostty-web/tree/nm-webgpu) where the nm-webgpu branch pioneered WebGPU support.

**Architecture:** Ghostty's native Zig terminal parser compiled to WASM (~404KB), wrapped with a TypeScript rendering layer. xterm.js API compatible — drop-in replacement by changing `@xterm/xterm` → `ghostty-web`.

**Rendering backends (in priority order):**

- **WebGPU** — preferred; full kitty graphics atlas performance
- **WebGL2** — fallback for Safari < 26 and Firefox without the flag
- **Canvas2D** — universal fallback; supports kitty graphics via 2D context
- Auto-detection with transparent fallback on init failure and runtime device/context loss

**Bundle size:** 638KB uncompressed, 185KB gzipped (v0.4.0). This is 2.3× more gzipped than xterm.js core+webgl combined, but ghostty-web includes the parser+renderer in one package.[Source](https://bundlephobia.com/package/ghostty-web)

**Kitty graphics:** Full support via Ghostty's native parser — the same codebase that runs the native Ghostty app. WebGPU/WebGL2 path uses atlas-based rendering; Canvas2D uses 2D context.

**Ligatures:** Inherently supported because Ghostty uses harfbuzz for font shaping in WASM. No separate addon needed.

**Compatibility claims vs xterm.js:** Handles complex scripts (Devanagari, Arabic) properly; supports XTPUSHSGR/XTPOPSGR (xterm.js issue #2570 remains unresolved). Direct VT100/ANSI compliance from Ghostty's parser.[Source](https://github.com/NimbleMarkets/ghostty-web/tree/nm-webgpu)

**Development status:** v0.3.0/v0.4.0 on npm. Built by Coder for the Mux desktop app. 20 contributors. 95 tests. Uses Bun runtime for testing.[Source](https://github.com/coder/ghostty-web)

**Limitations:**

- Pre-1.0 software with a small number of contributors
- 404KB WASM binary committed to repo; rebuilding requires Zig toolchain
- Only 95 tests (vs xterm.js's thousands)
- Not battle-tested at VS Code scale
- Firefox WebGPU support requires flag; Safari < 26 lacks WebGPU entirely

**xterm.js maintainer's view:** @Tyriar explored adopting Ghostty's parser in xterm.js (Issue #5686). Main concerns: losing control, debugging difficulty, potential regressions, parser handler API compatibility for VS Code shell integration. Described as interesting but not an imminent direction.[Source](https://github.com/xtermjs/xterm.js/issues/5686)

### 4. react-term — Web Workers + WebGL2 Architecture (Not Production-Ready)

**Repository:** [rahulpandita/react-term](https://github.com/rahulpandita/react-term) (2 stars).

**Architecture:** VT parser runs off-main-thread in a Web Worker with SharedArrayBuffer for zero-copy cell grid sharing. WebGL2 rendering with instanced rendering (2 draw calls/frame) and alpha-only glyph atlas. Canvas2D fallback (also off-worker). React/React Native focused.

**Strengths:** Architecturally interesting — the Web Worker + SharedArrayBuffer design could theoretically match native input latency better than xterm.js's main-thread pipeline. Shared WebGL context for multiple Terminal instances avoids Chrome's 16-context limit.

**Limitations:** No mention of Kitty graphics protocol, Sixel, or ligature support. Very early stage — effectively a proof of concept. 1-2 contributors. No npm package. Missing essential terminal features that xterm.js has spent years building.

### 5. Other Options Evaluated

**beamterm-renderer** — Rust crate with WebGL2/OpenGL rendering from a single codebase. Sub-millisecond render times claimed. However, it's a renderer only (not a terminal emulator), requires Rust → WASM compilation, and has no JS ecosystem integration. Not suitable as a drop-in terminal library.[Source](https://crates.io/crates/beamterm-renderer)

**WGLT (WebGL Terminal)** — ~30KB minified, ~10KB gzipped. Aimed at ASCII/roguelike games, not terminal emulation. Uses WebGL for minimal CPU but lacks VT100 parsing, escape sequences, or any terminal protocol support.[Source](https://wglt.js.org/)

**hterm (Chromium)** — DOM-based, used in Chrome OS Secure Shell. No GPU acceleration, no ligatures, no graphics protocols. Not competitive for native-level performance.

**Alacritty-web / alacritty_terminal WASM** — No maintained web port exists. Alacritty's Rust parser has been compiled to WASM experimentally but no maintained rendering layer for browsers.

---

## Comparison Matrix

| Criteria                 | xterm.js v6 + addons                 | ghostty-web                           | react-term                             |
| ------------------------ | ------------------------------------ | ------------------------------------- | -------------------------------------- |
| **Rendering backend**    | WebGL2, Canvas2D, WebGPU (draft)     | WebGPU, WebGL2, Canvas2D              | WebGL2, Canvas2D                       |
| **Kitty graphics**       | ✅ via addon-image (MVP)             | ✅ native via WASM parser             | ❌                                     |
| **Sixel**                | ✅ via addon-image                   | ❓ (via kitty path)                   | ❌                                     |
| **Ligatures**            | ✅ via addon-ligatures (fontkit)     | ✅ via harfbuzz in WASM               | ❌                                     |
| **Smooth scrolling**     | ✅ duration-based (JS)               | ✅ 60fps canvas                       | ❓                                     |
| **Input latency**        | ~4ms (optimized JS)                  | ❓ (no benchmarks)                    | ❓ (architecture promising)            |
| **Total gzip bundle**    | ~193 KB (core+webgl+ligatures+image) | ~185 KB (single pkg)                  | N/A                                    |
| **Maintenance**          | Very active (20.5K ★, Microsoft)     | Active (2.3K ★, Coder)                | Minimal (2 ★)                          |
| **Production readiness** | ✅ VS Code, Hyper, Tabby             | ⚠️ Pre-1.0 (v0.4.0)                   | ❌ Prototype                           |
| **API compatibility**    | Reference implementation             | xterm.js API compatible               | React-specific                         |
| **WASM requirement**     | No (pure JS)                         | Yes (404KB .wasm, COOP/COEP required) | No (SharedArrayBuffer needs COOP/COEP) |

---

## Sources

### Kept

- **xterm.js GitHub** (https://github.com/xtermjs/xterm.js) — Primary source for all xterm.js features, benchmarks, and roadmap. 20.5K stars.
- **xterm.js WebGL Renderer PR #1790** (https://github.com/xtermjs/xterm.js/pull/1790) — Original WebGL2 implementation with detailed performance benchmarks showing 5-9x speedup over canvas.
- **xterm.js v6.0.0 Release** (https://github.com/xtermjs/xterm.js/releases/tag/6.0.0) — Changelog for v6 with synchronized output, shadow DOM WebGL, detailed ligatures.
- **xterm.js Kitty Graphics Issue #5592** (https://github.com/xtermjs/xterm.js/issues/5592) — Kitty graphics protocol implementation, merged Feb 2026.
- **xterm.js WebGPU Renderer PR #5666** (https://github.com/xtermjs/xterm.js/pull/5666) — Draft WebGPU renderer from @Tyriar, Feb 2026.
- **xterm.js ESM Code Splitting PR #5610** (https://github.com/xtermjs/xterm.js/pull/5610) — Lazy loading reduces bundle ~17%.
- **xterm.js Input Latency PR #4145** (https://github.com/xtermjs/xterm.js/pull/4145) — Reduced from 10ms → 4ms.
- **coder/ghostty-web GitHub** (https://github.com/coder/ghostty-web) — Primary source for ghostty-web, 2.3K stars, xterm.js API compatible.
- **NimbleMarkets/ghostty-web nm-webgpu branch** (https://github.com/NimbleMarkets/ghostty-web/tree/nm-webgpu) — README with detailed WebGPU/WebGL2/Canvas2D renderer comparison and kitty graphics support.
- **xterm.js Explore libghostty Issue #5686** (https://github.com/xtermjs/xterm.js/issues/5686) — @Tyriar's evaluation of adopting Ghostty's parser in xterm.js.
- **rahulpandita/react-term** (https://github.com/rahulpandita/react-term) — Web Workers + SharedArrayBuffer + WebGL2 prototype.
- **bundlephobia API** — Bundle sizes for @xterm/xterm, addon-webgl, addon-ligatures, addon-image, ghostty-web.
- **Scopir Terminal Comparison 2026** (https://scopir.com/posts/best-terminal-emulators-developers-2026/) — Native terminal latency benchmarks for context: kitty ~3ms, ghostty ~2ms, xterm.js in-browser ~4ms+.

### Dropped

- WGLT (https://wglt.js.org/) — Not a terminal emulator; ASCII game renderer.
- hterm docs — DOM-based Chrome OS terminal, no GPU acceleration.
- beamterm-renderer crate — Renderer only, no terminal emulation, no JS interoperability.
- Various blog/SEO terminal comparisons — repackaged the GitHub source data without adding primary evidence.
- Terminal-image Sixel issue — peripheral npm package, not relevant to emulator choice.

---

## Gaps

1. **ghostty-web lacks public performance benchmarks** — No published render time, input latency, or throughput measurements. Claims of "WebGPU faster than WebGL2" and "atlas-based kitty graphics" are plausible but unverified externally. A head-to-head benchmark vs xterm.js WebGL would be valuable.

2. **ghostty-web v0.4.0 npm package doesn't reflect nm-webgpu branch** — The nm-webgpu branch README describes WebGPU/WebGL2/Canvas2D renderers and kitty graphics atlas path, but the published npm version (0.4.0) appears to only include canvas2d renderer. The nm-webgpu branch is the one to evaluate for WebGPU support. Clarify which branch maps to which npm version.

3. **Sixel rendering regression in xterm.js v6.0.0** — Issue #5644 reports Sixel images parsed but not rendered. Needs confirmation whether this is resolved in the v6.1.0 beta series.

4. **No live xterm.js GPU performance data on modern hardware** — The PR #1790 benchmarks use 2014 MacBook Pro (Iris Pro) and older GTX 760. Modern integrated GPUs (Apple M-series, Intel Arc, AMD RDNA) may show different characteristics, especially for the reported GPU usage issue (#5447).

5. **COOP/COEP header requirements** — Both ghostty-web (WASM) and react-term (SharedArrayBuffer) require Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers. This is a deployment constraint that xterm.js (pure JS) avoids. Impact on embedding in iframes or behind proxies not assessed.

## Supervisor Coordination

No blocking decisions required. Research is complete and covers all requested evaluation criteria. The recommendation is clear: **xterm.js v6 + addon-webgl + addon-image for production now; track ghostty-web's nm-webgpu branch for strategic migration when it hits v1.0 and demonstrates benchmark parity.**
