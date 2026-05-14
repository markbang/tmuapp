# Terminal Boundary

The terminal module is the fragile core of tmuapp. Treat it as a device boundary, not a normal UI widget.

## Ownership

Terminal code owns:

- `WTerm` construction and lifecycle
- WebSocket stream parsing and sending
- HTTP capture fallback
- terminal resize measurement and debounce
- scroll-follow behavior
- ANSI normalization
- raw keyboard input forwarding

Product views may render a terminal viewport, but must not directly manipulate WTerm internals.

## Editing rules

Do not edit terminal code for visual-only product changes.

Do not:

- instantiate `new WTerm(...)` outside the terminal module
- mutate `.term-row`, `.term-cursor`, or WTerm bridge from page components
- change `normalizeAnsi` without a regression test
- change resize measurement/debounce without running the terminal e2e suite
- route raw keyboard data through HTTP when the WebSocket is open
- send named keys such as `Enter` through the raw WebSocket input path

## Input contract

- Raw terminal typing goes through WebSocket when the stream is open.
- Named keys go through `/api/panes/:pane/keys`.
- The command form sends `/input` and then `Enter`.
- If streaming fails before first output, fallback to HTTP capture.

## Required verification after terminal changes

Run from the repo root:

```bash
pnpm exec vp run -F utils build
pnpm exec vp check
pnpm exec vp run website#e2e
```

The Playwright tests intentionally guard terminal fit, scrollback, cursor position, paste/raw keys, token dialog, offline state, and destructive action confirmation.
