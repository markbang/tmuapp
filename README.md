# tmuapp

tmuapp is a production-oriented tmux management console. It ships as a web UI, HTTP API, Docker image, and Jetpack Compose Android client for managing real tmux sessions on a machine you control.

The web console renders ANSI pane output with wterm, keeps the cursor aligned with tmux pane metadata, and can send literal input, Enter, splits, resizes, session creation, and window management commands back to tmux.

## Features

- Web console for sessions, windows, panes, ANSI capture, pane resize, split, and input.
- HTTP API over the local `tmux` command for automation and mobile clients.
- Optional bearer-token protection with `TMUAPP_TOKEN` for non-local deployments.
- Docker image with `tmux`, static web assets, API server, and healthcheck included.
- Jetpack Compose Android client with signed release APKs published from GitHub Actions.
- Release artifacts for universal Android APK, ABI-specific APKs, and GHCR Docker tags.

## Workspace

- `apps/api` exposes the tmux HTTP API and serves the built web UI in production.
- `apps/website` is the Vite web console.
- `apps/android` is the Jetpack Compose Android client source.
- `packages/utils` contains shared tmux formats, parsers, types, and target validation.
- `Dockerfile` builds the runtime image.
- `.github/workflows/ci.yml` builds, tests, publishes Docker, and produces signed Android APKs.

## Quick Start

Run from source on a machine with `tmux` installed:

```bash
vp install
vp run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/health` to `http://localhost:8787`.

Run the production server locally:

```bash
vp run -r build
PORT=8787 vp run api#start
```

Open `http://localhost:8787`; the API serves the built web console and `/api/*` from the same origin.

## Docker

Pull a release image:

```bash
docker pull ghcr.io/markbang/tmuapp:0.1.0
```

Run it with an isolated tmux server inside the container:

```bash
docker run --rm \
  -p 8787:8787 \
  -e TMUAPP_TOKEN='change-this-token' \
  ghcr.io/markbang/tmuapp:0.1.0
```

Use `latest`, `0.1.0`, or `v0.1.0` tags. On pushes to `main`, GitHub Actions publishes all three tags to GHCR.

The image exposes `/health` and includes a Docker `HEALTHCHECK`. Keep tmuapp behind a trusted network, VPN, SSH tunnel, or reverse proxy. If it is reachable outside localhost, set `TMUAPP_TOKEN` and require HTTPS at the proxy.

To control a host tmux server from Docker, mount the tmux socket directory and run the container with the same UID as the host tmux server owner. For most users, the isolated in-container tmux server is simpler and safer.

## Authentication

Authentication is disabled by default for local development. Set `TMUAPP_TOKEN` to require a token for every `/api/*` endpoint:

```bash
TMUAPP_TOKEN='change-this-token' PORT=8787 vp run api#start
```

Clients can authenticate with either header:

```http
Authorization: Bearer change-this-token
X-Tmuapp-Token: change-this-token
```

The web console has a `Token` button that stores the token in browser local storage. The Android client has an API token field. `/health` and static web assets stay public so load balancers and browsers can reach the app shell.

## Android

The Android client is a Jetpack Compose native app. It can call `/health`, list sessions, create and kill sessions, capture panes, send literal input, and send Enter to a pane target.

Do not build the Android app locally for this delivery. GitHub Actions runs:

```bash
gradle -p apps/android assembleRelease
```

The workflow signs and verifies APKs before uploading the `tmuapp-release-apk` artifact. GitHub Release `v0.1.0` contains:

- `tmuapp-v0.1.0.apk`
- `tmuapp-arm64-v8a-v0.1.0.apk`
- `tmuapp-armeabi-v7a-v0.1.0.apk`
- `tmuapp-x86-v0.1.0.apk`
- `tmuapp-x86_64-v0.1.0.apk`

Push builds require these GitHub secrets:

- `ANDROID_SIGNING_KEYSTORE_BASE64`
- `ANDROID_SIGNING_STORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`

## API

See `docs/API.md` for endpoint details.

Common calls:

```bash
curl http://localhost:8787/health
curl -H 'Authorization: Bearer change-this-token' http://localhost:8787/api/sessions
curl -X POST -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer change-this-token' \
  -d '{"name":"work"}' \
  http://localhost:8787/api/sessions
```

Targets are tmux ids or target strings such as `%1`, `@1`, `$1`, or `work:0.0`.

## Local Development

Install dependencies after cloning or pulling:

```bash
vp install
```

Run API and web together:

```bash
vp run dev
```

Run them separately when debugging one side:

```bash
vp run api#dev
vp run website#dev
```

If you enable auth during web development, provide the token through the UI or set `VITE_TMUAPP_TOKEN` for the website dev server.

## Validation

Run the release gate:

```bash
vp run ready
```

Equivalent commands:

```bash
vp run -r build
vp check
vp run -r test
vp run website#e2e
```

For production confidence, also run a container and probe the health/API path:

```bash
docker build -t tmuapp:local .
docker run --rm -p 8787:8787 -e TMUAPP_TOKEN=dev-token tmuapp:local
curl http://localhost:8787/health
curl -H 'Authorization: Bearer dev-token' http://localhost:8787/api/sessions
```

## Release

GitHub Actions is the source of release artifacts:

- Web/API build, lint, unit tests, and Playwright e2e must pass.
- Docker image is pushed to GHCR as `latest`, `0.1.0`, and `v0.1.0`.
- Android release APKs are signed, verified with `apksigner`, uploaded as workflow artifacts, and attached to GitHub Release `v0.1.0`.
