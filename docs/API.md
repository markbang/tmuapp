# tmuapp API

`tmuapp` exposes a small HTTP + WebSocket API over the local `tmux` command. It is used by the web console, Android app, and automation scripts.

Base URL examples below use:

```bash
export TMUAPP_URL='http://localhost:8787'
export TMUAPP_TOKEN='write-token-change-me'
```

Targets are tmux ids or target strings such as `%1`, `@1`, `$1`, or `work:0.0`. URL-encode special characters in paths: `%1` becomes `%251`, `$1` becomes `%241`.

## Authentication

When auth is configured, every `/api/*` endpoint and pane stream requires a token. `/health` and static web assets remain public for load balancers and browser app-shell loading.

### Token levels

| Level   | Env var              | Purpose                                                                |
| ------- | -------------------- | ---------------------------------------------------------------------- |
| `read`  | `TMUAPP_TOKEN_READ`  | Safe monitoring: list sessions, capture output, read-only streams.     |
| `write` | `TMUAPP_TOKEN_WRITE` | Interactive use: read plus input, keys, resize, and create operations. |
| `admin` | `TMUAPP_TOKEN_ADMIN` | Owner operations: write plus kill/delete and admin-only actions.       |

Legacy deployments may use a single token:

```bash
export TMUAPP_TOKEN='change-this-token'
```

When only `TMUAPP_TOKEN` is set, treat it as a high-trust/admin token.

### Passing a token

Preferred HTTP header:

```http
Authorization: Bearer <token>
```

Alternative HTTP header:

```http
X-Tmuapp-Token: <token>
```

For browser WebSocket clients that cannot set headers, pass the token as a query parameter:

```text
ws://localhost:8787/api/panes/%251/stream?token=<token>
```

Avoid query tokens for normal HTTP requests because proxies and logs may record URLs.

### Permission summary

| Endpoint / action                | Minimum token |
| -------------------------------- | ------------- |
| `GET /api/sessions`              | `read`        |
| `POST /api/sessions`             | `write`       |
| `GET /api/panes/:target/capture` | `read`        |
| `POST /api/panes/:target/input`  | `write`       |
| `POST /api/panes/:target/keys`   | `write`       |
| `POST /api/panes/:target/resize` | `write`       |
| `DELETE /api/windows/:id`        | `admin`       |
| `DELETE /api/sessions/:id`       | `admin`       |
| `GET /api/panes/:target/stream`  | `read`        |
| WebSocket `input` command        | `write`       |
| WebSocket `resize` command       | `write`       |

## Common response shapes

Successful mutation endpoints usually return:

```json
{ "ok": true }
```

Errors return:

```json
{ "error": "message" }
```

## Endpoints

### `GET /api/sessions`

Returns the current tmux snapshot: sessions, windows, and panes.

Permission: `read`

```bash
curl -H "Authorization: Bearer $TMUAPP_TOKEN" \
  "$TMUAPP_URL/api/sessions"
```

Example response shape:

```json
{
  "sessions": [{ "id": "$1", "name": "work", "attached": false, "created": 1760000000 }],
  "windows": {
    "$1": [{ "id": "@1", "name": "zsh", "index": 0, "active": true }]
  },
  "panes": {
    "@1": [
      {
        "id": "%1",
        "index": 0,
        "active": true,
        "currentCommand": "zsh",
        "currentPath": "/workspace"
      }
    ]
  }
}
```

### `POST /api/sessions`

Creates a detached tmux session.

Permission: `write`

Request body:

```json
{ "name": "work", "cwd": "/workspace" }
```

`cwd` is optional.

```bash
curl -X POST \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"work","cwd":"/workspace"}' \
  "$TMUAPP_URL/api/sessions"
```

### `DELETE /api/sessions/:id`

Kills a tmux session.

Permission: `admin`

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  "$TMUAPP_URL/api/sessions/%241"
```

### `GET /api/panes/:target/capture`

Captures ANSI output from a pane.

Permission: `read`

Query parameters:

| Name    | Default | Notes                                                         |
| ------- | ------: | ------------------------------------------------------------- |
| `lines` |    `80` | Clamped by the server; use a larger value for recent history. |

```bash
curl -H "Authorization: Bearer $TMUAPP_TOKEN" \
  "$TMUAPP_URL/api/panes/%251/capture?lines=240"
```

Example response shape:

```json
{
  "target": "%1",
  "ansi": "...",
  "lines": 240,
  "terminal": { "columns": 120, "rows": 34 },
  "cursor": { "x": 0, "y": 33 }
}
```

### `POST /api/panes/:target/input`

Sends literal input to a pane. Use this for quick replies like `y`, `n`, or short text.

Permission: `write`

Request body:

```json
{ "data": "y" }
```

```bash
curl -X POST \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"data":"y"}' \
  "$TMUAPP_URL/api/panes/%251/input"
```

### `POST /api/panes/:target/keys`

Sends tmux key names to a pane. Use this for `Enter`, `C-c`, `C-d`, function keys, and other tmux-supported key names.

Permission: `write`

Request body:

```json
{ "keys": ["Enter"] }
```

Examples:

```bash
curl -X POST \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"keys":["Enter"]}' \
  "$TMUAPP_URL/api/panes/%251/keys"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"keys":["C-c"]}' \
  "$TMUAPP_URL/api/panes/%251/keys"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"keys":["C-d"]}' \
  "$TMUAPP_URL/api/panes/%251/keys"
```

### `POST /api/panes/:target/resize`

Resizes the tmux pane/window to match a fitted terminal client.

Permission: `write`

Request body:

```json
{ "width": 120, "height": 34 }
```

```bash
curl -X POST \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"width":120,"height":34}' \
  "$TMUAPP_URL/api/panes/%251/resize"
```

### `DELETE /api/windows/:id`

Kills a tmux window.

Permission: `admin`

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TMUAPP_TOKEN" \
  "$TMUAPP_URL/api/windows/%401"
```

## Additional current endpoints

The web app may also use these endpoints when window-management features are enabled:

| Endpoint                        | Minimum token | Purpose                                                                                                       |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/windows`             | `write`       | Create a new tmux window in a session.                                                                        |
| `POST /api/panes/:target/split` | `write`       | Split a pane. This is retained for API compatibility even if the simplified UI does not expose split buttons. |

## WebSocket stream

Endpoint:

```text
GET /api/panes/:target/stream
```

Permission:

- Connecting and receiving output: `read`
- Sending `input` or `resize` commands over the socket: `write`

Browser URL example:

```text
ws://localhost:8787/api/panes/%251/stream?token=write-token-change-me
```

Server-to-client messages are JSON:

```json
{ "type": "output", "data": "terminal bytes / ANSI text" }
```

```json
{ "type": "error", "message": "tmux error message" }
```

Client-to-server commands:

### `input`

Sends literal input to the pane.

```json
{ "type": "input", "data": "y" }
```

### `resize`

Resizes the stream client and tmux pane/window.

```json
{ "type": "resize", "columns": 120, "rows": 34 }
```

Minimal Node.js example:

```bash
node - <<'EOF'
const token = process.env.TMUAPP_TOKEN;
const ws = new WebSocket(`ws://localhost:8787/api/panes/%251/stream?token=${token}`);
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'output') process.stdout.write(message.data);
  if (message.type === 'error') console.error(message.message);
};
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'resize', columns: 120, rows: 34 }));
};
EOF
```

## Limits and safety notes

- JSON request bodies are limited to 64 KiB.
- Pane capture line counts and resize dimensions are clamped by the server.
- Targets are validated before tmux commands are executed.
- Input, keys, resize, create, split, and kill/delete operations should be considered remote shell control.
- Put tmuapp behind HTTPS, Tailscale, Cloudflare Tunnel, SSH tunnel, or another trusted network boundary before remote use.
