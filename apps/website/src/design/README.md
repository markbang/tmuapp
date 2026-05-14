# tmuapp Design System

This directory is the product design contract for the web console. It exists so AI and humans can improve the interface without drifting into generic SaaS UI or breaking the terminal.

## Product posture

tmuapp is a **black cockpit for tmux workspaces**:

- calm, operational, fast to scan
- terminal-native without looking like a toy terminal skin
- near-black surfaces with precise hairlines
- one lavender accent for intent, focus, and selected state
- dense enough for real work, but never debug-panel clutter

## Information architecture

Use these product names and mental models when changing screens:

1. **Fleet** — the session overview. The user is choosing a tmux worksite.
2. **Cockpit** — the session manager. The active pane is the primary surface.

Do not add extra top-level modes unless a user task cannot fit one of these two surfaces.

## Token rules

- Use the CSS variables in `styles/tokens.css` for color, spacing, radii, and shadows.
- Do not add one-off hex colors in components. Add a semantic token first if a new color is truly required.
- `--primary` is the only brand accent. Use it for primary CTA, focus, active state, and selected state only.
- Danger/success/warning are semantic, not decoration.
- Terminal output and terminal previews may use monospace. Product chrome should use the sans stack.

## Anti-slop rules

Avoid:

- gradients as decoration
- glassmorphism
- emoji UI
- random icon cards
- fake metrics
- rainbow status colors
- oversized rounded cards that hide weak hierarchy
- marketing copy inside the operating console

Good tmuapp UI should feel like a purpose-built instrument panel, not a landing page.

## AI editing rules

When asking an AI to change frontend code:

1. State whether the task touches **Fleet**, **Cockpit**, or **Terminal**.
2. If it does not explicitly touch Terminal, the AI must not edit `src/terminal/*` or `.wterm` CSS.
3. Ask for file-level changes, not broad “make it nicer” edits.
4. Require e2e tests after changes that affect layout, terminal, dialogs, or input.

Example prompt:

> Refine the Fleet session cards only. Use existing tokens. Do not edit terminal code or terminal CSS. Preserve all tests and add/update an e2e assertion if layout semantics change.
