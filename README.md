# tmuapp

tmuapp is a tmux management console with a web UI, HTTP API, and Android client source. It targets real tmux sessions through the `tmux` command and renders pane output through xterm.js so ANSI colors and terminal layout survive in the browser.

## Workspace

- `apps/api` exposes the tmux HTTP API and serves the built web UI in production.
- `apps/website` is the Vite web console styled from `DESIGN.md`.
- `apps/android` is Android source for a native API client. Build APKs in GitHub Actions, not locally.
- `packages/utils` contains shared tmux formats, parsers, types, and target validation.
- `.github/workflows/ci.yml` checks, tests, builds Docker, and builds the Android debug APK artifact.
- `Dockerfile` builds a runtime image with Node, the API, the static web UI, and `tmux` installed.

## Local Development

Install dependencies after cloning or pulling:

```bash
vp install
```

Run the API and web console together:

```bash
vp run dev
```

`vp run dev` starts the API on `http://localhost:8787` and the Vite web console on `http://localhost:5173` with `/api` and `/health` proxied to the API.

Run them separately when debugging one side:

```bash
vp run api#dev
vp run website#dev
```

Open the Vite URL and point it at a host where `tmux` is installed and the API process has access to the tmux server/socket.

## Validation

```bash
vp run -r build
vp check
vp run -r test
vp run website#e2e
```

`vp run ready` runs the same release gate.

## Docker

Build locally only when needed:

```bash
docker build -t tmuapp .
docker run --rm -p 8787:8787 tmuapp
```

On pushes to `main`, GitHub Actions publishes `ghcr.io/<owner>/<repo>:latest`. Use the public GitHub repository package for image distribution.

## Android

The Android client is intentionally checked in as source. It can call `/health`, list sessions, create and kill sessions, capture panes, send literal input, and send Enter to a pane target.

Do not build the Android app locally for this delivery. GitHub Actions runs:

```bash
gradle -p apps/android assembleDebug
```

and uploads `tmuapp-debug-apk` as a workflow artifact.

## API

See `docs/API.md` for endpoint details.
