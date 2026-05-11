# tmuapp API

The API is a local HTTP facade over the `tmux` command. It is designed for the web console, Android app, and automation clients that need to inspect or control tmux sessions.

## Authentication

Authentication is disabled unless the server is started with `TMUAPP_TOKEN`.

When `TMUAPP_TOKEN` is set, every `/api/*` endpoint requires one of these headers:

```http
Authorization: Bearer <token>
X-Tmuapp-Token: <token>
```

`GET /health` and static web assets remain public for load balancers and browser app-shell loading.

## Limits

- JSON request bodies are limited to 64 KiB.
- Pane capture `lines` is clamped to `1..5000`.
- Pane resize dimensions are clamped to `20..500` columns and `5..200` rows.
- Session and window names must be 1-80 characters and only include letters, numbers, dot, underscore, plus, or dash.
- Targets are validated before calling `tmux`.

## Endpoints

- `GET /health` returns service status.
- `GET /api/sessions` returns sessions, windows, and panes in one snapshot.
- `POST /api/sessions` with `{ "name": "work", "cwd": "/repo" }` creates a detached session.
- `DELETE /api/sessions/:target` kills a session.
- `POST /api/windows` with `{ "target": "$1", "name": "server" }` creates a window.
- `DELETE /api/windows/:target` kills a window.
- `GET /api/panes/:target/capture?lines=240` returns ANSI pane output, requested history line count, terminal dimensions, and cursor position.
- `POST /api/panes/:target/input` with `{ "data": "literal text" }` sends literal input.
- `POST /api/panes/:target/keys` with `{ "keys": ["Enter"] }` sends tmux key names.
- `POST /api/panes/:target/split` with `{ "direction": "horizontal" }` splits a pane. Direction can be `horizontal` or `vertical`.
- `POST /api/panes/:target/resize` with `{ "width": 120, "height": 34 }` resizes the pane for fitted terminal rendering.

Targets are tmux ids or tmux target strings such as `%1`, `@1`, `$1`, or `work:0.0`.

## Example

```bash
curl http://localhost:8787/health
curl -H 'Authorization: Bearer change-this-token' http://localhost:8787/api/sessions
curl -H 'Authorization: Bearer change-this-token' \
  'http://localhost:8787/api/panes/%251/capture?lines=120'
```
