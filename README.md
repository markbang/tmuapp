# tmuapp

> **Agent stuck? Reply from your phone.**

`tmuapp` is a self-hosted **tmux cockpit**.

It lets you monitor long-running tasks, builds, deploys, logs, and AI coding agents from a browser or Android phone. You do not need to keep an SSH session open or hunt through terminal windows. Open tmuapp, check the state, and send a quick reply when needed.

## Why tmuapp?

You may want tmuapp if:

- Claude Code, Codex, or another coding agent gets stuck waiting for confirmation.
- Tests, builds, deployments, training jobs, crawlers, or log tails run for a long time.
- Your remote machine has many tmux sessions and you want to know what is still active.
- You leave your desk but still want to check progress from your phone.
- You only need to send a small response like `y`, `n`, `Enter`, or `Ctrl-C`.

`tmuapp` does not try to replace your terminal. It adds a lightweight remote control plane on top of the tmux workflow you already use.

## In one sentence

**Use Web and Android to safely monitor your tmux tasks, and reply quickly when an agent is waiting for you.**

## Who is it for?

- Developers who live in tmux.
- People running work on remote servers, dev boxes, NAS machines, or containers.
- Users of Claude Code, Codex CLI, Aider, Gemini CLI, and other AI coding agents.
- Self-hosting users who do not want terminal data sent to a third-party SaaS.
- Anyone who wants mobile monitoring, not a full mobile IDE.

## What can it do?

- View tmux sessions, windows, and panes in a browser.
- See recent output and live terminal streams.
- Create sessions, split panes, send input, and send tmux keys.
- Monitor remote tasks from an Android phone.
- Quickly send replies such as `y`, `n`, `Enter`, or `Ctrl-C`.
- Protect access with tokens and run behind your trusted network, VPN, or reverse proxy.

## Quick start

You need Docker on the machine that should run tmuapp:

```bash
docker run --rm \
  -p 8787:8787 \
  -e TMUAPP_TOKEN='change-this-token' \
  ghcr.io/markbang/tmuapp:latest
```

Then open:

```text
http://localhost:8787
```

For phone or remote access, run tmuapp behind Tailscale, a VPN, HTTPS reverse proxy, or Cloudflare Tunnel, and always use a strong token.

## Common use cases

### Local monitoring

Run tmuapp on your development machine and open the dashboard in a browser to see your tmux sessions at a glance.

### Remote server monitoring

Deploy tmuapp on a remote server and access it through Tailscale or HTTPS. This is useful for builds, deploys, logs, training jobs, and other long-running work.

### AI agent monitoring

Run Claude Code, Codex, or another coding agent inside tmux. When you leave your desk, use tmuapp to check whether it is still working or waiting for input. If needed, reply from your phone.

### Android companion

The Android app is meant to be a companion monitor, not a full mobile terminal. It is best for checking status, reading recent output, and sending small, low-risk actions.

## Security

`tmuapp` can send input to real shells through tmux. Treat write access like SSH access.

Recommended precautions:

- Do not expose tmuapp directly to the public internet.
- Always configure a token.
- Prefer Tailscale, a VPN, Cloudflare Tunnel, or an HTTPS reverse proxy.
- Use read-only or low-privilege tokens for monitoring-only clients when possible.
- Never commit tokens to a repository or share them in screenshots.

For API and deployment details, see [`docs/API.md`](docs/API.md).

## Project direction

`tmuapp` is focused on three things:

1. **Remote monitoring** — clearly show what is happening inside tmux.
2. **Agent awareness** — detect whether coding agents are working, done, or waiting for you.
3. **Fast intervention** — make the smallest necessary action easy from Web or Android.

It is not trying to become:

- A custom terminal emulator.
- A full cloud IDE.
- A heavy team collaboration platform.
- An agent orchestration platform.
- A plugin marketplace or large workspace system.

For the longer product discussion, see [`docs/tmuapp-future-directions.md`](docs/tmuapp-future-directions.md).

## Development

If you want to work on the project:

```bash
vp install
vp run dev
```

Useful checks:

```bash
vp check
vp run -r test
```

The README intentionally stays user-facing. Detailed API, build, release, and implementation notes live in the docs and source tree.

## License

TBD.
