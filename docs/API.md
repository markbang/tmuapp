# tmuapp API

The API is a local HTTP facade over the `tmux` command. It is designed for the web console, Android app, and other automation clients.

## Endpoints

- `GET /health` returns service status.
- `GET /api/sessions` returns sessions, windows, and panes in one snapshot.
- `POST /api/sessions` with `{ "name": "work", "cwd": "/repo" }` creates a detached session.
- `DELETE /api/sessions/:target` kills a session.
- `POST /api/windows` with `{ "target": "$1", "name": "server" }` creates a window.
- `DELETE /api/windows/:target` kills a window.
- `GET /api/panes/:target/capture?lines=240` returns ANSI pane output and terminal dimensions.
- `POST /api/panes/:target/input` with `{ "data": "literal text" }` sends literal input.
- `POST /api/panes/:target/keys` with `{ "keys": ["Enter"] }` sends tmux key names.
- `POST /api/panes/:target/resize` with `{ "width": 120, "height": 34 }` resizes the pane for fitted terminal rendering.

Targets are tmux ids or tmux target strings such as `%1`, `@1`, `$1`, or `work:0.0`.
