# P0.4 + P1.3 Handoff: README + API docs

## Summary

Implemented the documentation task for:

- **P0.4 README / Onboarding rewrite**
- **P1.3 API documentation**

## Changed files

- `README.md`
- `docs/API.md`
- `progress.md`
- `handoff/p0-readme-docs-handoff.md`

## README.md updates

Rewrote the README with the requested structure:

1. One-liner: `🤖 Agent 卡了？手机秒回。`
2. What is tmuapp: self-hosted tmux cockpit for browser/phone monitoring.
3. 5-minute Docker quick start.
4. Key features:
   - Dashboard
   - Agent Cockpit
   - Quick Reply
   - Android
   - Secure multi-token/read-only/CORS
   - Self-hosted Docker
5. Screenshot placeholder comments.
6. Security setup with `TMUAPP_TOKEN_READ`, `TMUAPP_TOKEN_WRITE`, `TMUAPP_TOKEN_ADMIN`, `TMUAPP_CORS_ORIGINS`, plus legacy `TMUAPP_TOKEN` note.
7. Deployment guide bullets for Docker, Compose, Tailscale, Cloudflare Tunnel, and nginx.
8. API quick reference with curl examples.
9. Android releases link.
10. Local development commands.

Style is Chinese-friendly, action-oriented, and command-heavy.

## docs/API.md updates

Created a full API reference covering:

- Authentication and token levels: `read`, `write`, `admin`.
- Header auth and WebSocket query-token auth.
- Permission table for each required endpoint/action.
- Endpoint docs and curl examples for:
  - `GET /api/sessions`
  - `POST /api/sessions`
  - `GET /api/panes/:target/capture`
  - `POST /api/panes/:target/input`
  - `POST /api/panes/:target/keys`
  - `POST /api/panes/:target/resize`
  - `DELETE /api/windows/:id`
  - `DELETE /api/sessions/:id`
- WebSocket `/api/panes/:target/stream`:
  - server messages: `{ "type": "output", "data": ... }`, `{ "type": "error", "message": ... }`
  - client commands: `{ "type": "input", "data": ... }`, `{ "type": "resize", "columns": ..., "rows": ... }`
- Current compatibility endpoints:
  - `POST /api/windows`
  - `POST /api/panes/:target/split`

## Notes / assumptions

- `/home/bangwu/code/tmuapp/context.md` and `/home/bangwu/code/tmuapp/plan.md` were requested but do not exist in this checkout; reads returned `ENOENT`.
- Current `apps/api/src/server.ts` still visibly contains legacy `TMUAPP_TOKEN`-style auth in the inspected snapshot. The docs include the requested multi-token model from P0.1 and keep a legacy-token note to avoid confusing existing users during the transition.
- No code behavior was changed by this task.

## Validation

- Documentation files were written successfully.
- Formatting/type validation should be run by the parent or final integration step after all parallel workers finish, because other tasks may be writing concurrently.
