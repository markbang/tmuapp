#!/usr/bin/env bash
set -euo pipefail

# tmuapp — native system install (like Tailscale)
# One command: curl -fsSL https://raw.githubusercontent.com/markbang/tmuapp/main/scripts/install.sh | bash

TMUAPP_PORT="${TMUAPP_PORT:-8787}"
TMUAPP_HOME="${TMUAPP_HOME:-$HOME/.tmuapp}"
REPO="https://github.com/markbang/tmuapp.git"

BOLD="$(tput bold 2>/dev/null || echo '')"
RESET="$(tput sgr0 2>/dev/null || echo '')"
GREEN="$(tput setaf 2 2>/dev/null || echo '')"
YELLOW="$(tput setaf 3 2>/dev/null || echo '')"

info()  { echo "${BOLD}${GREEN}→${RESET} $*"; }
warn()  { echo "${BOLD}${YELLOW}⚠${RESET} $*" >&2; }
error() { echo "${BOLD}${YELLOW}✗${RESET} $*" >&2; exit 1; }

# ── prerequisites ──────────────────────────────────────────────
command -v node  >/dev/null 2>&1 || error "Node.js is required. Install: https://nodejs.org"
command -v pnpm  >/dev/null 2>&1 || npm install -g pnpm
command -v tmux  >/dev/null 2>&1 || error "tmux is required. Install: apt install tmux / brew install tmux"

# ── clone or update ────────────────────────────────────────────
if [ -d "$TMUAPP_HOME/.git" ]; then
  info "Updating tmuapp..."
  git -C "$TMUAPP_HOME" pull --ff-only
else
  info "Cloning tmuapp to $TMUAPP_HOME..."
  git clone "$REPO" "$TMUAPP_HOME"
fi

cd "$TMUAPP_HOME"

# ── build ───────────────────────────────────────────────────────
info "Installing dependencies..."
pnpm install --frozen-lockfile

info "Building..."
pnpm exec vp run -r build

# ── configure ──────────────────────────────────────────────────
ENV_FILE="$TMUAPP_HOME/.env"
if [ ! -f "$ENV_FILE" ]; then
  TMUAPP_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  cat > "$ENV_FILE" <<EOF
# tmuapp configuration
TMUAPP_PORT=$TMUAPP_PORT
TMUAPP_TOKEN_ADMIN=$TMUAPP_TOKEN
TMUAPP_TOKEN_READ=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
TMUAPP_CORS_ORIGINS=
EOF
  info "Generated config at $ENV_FILE"
  warn "Admin token: $TMUAPP_TOKEN  (save this!)"
else
  info "Config already exists at $ENV_FILE"
fi

# ── install service ────────────────────────────────────────────
case "$(uname -s)" in
  Linux)
    SERVICE_FILE="/etc/systemd/system/tmuapp.service"
    info "Installing systemd service..."
    cat > /tmp/tmuapp.service <<SERVICE
[Unit]
Description=tmuapp — tmux cockpit
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$TMUAPP_HOME
EnvironmentFile=$ENV_FILE
ExecStart=$(which node) $TMUAPP_HOME/apps/api/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
    if [ -w /etc/systemd/system ]; then
      mv /tmp/tmuapp.service "$SERVICE_FILE"
    else
      info "Need sudo to install systemd service:"
      sudo mv /tmp/tmuapp.service "$SERVICE_FILE"
    fi
    sudo systemctl daemon-reload
    sudo systemctl enable --now tmuapp
    info "Service started. Check: systemctl status tmuapp"
    info "Open: http://localhost:$TMUAPP_PORT"
    ;;

  Darwin)
    PLIST="$HOME/Library/LaunchAgents/dev.tmuapp.plist"
    info "Installing launchd service..."
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.tmuapp</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>$TMUAPP_HOME/apps/api/dist/index.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TMUAPP_PORT</key>
    <string>$TMUAPP_PORT</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>$TMUAPP_HOME</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
PLIST
    launchctl load "$PLIST"
    info "Service started. Check: launchctl list | grep tmuapp"
    info "Open: http://localhost:$TMUAPP_PORT"
    ;;

  *)
    warn "Unknown OS. Start manually:"
    echo "  cd $TMUAPP_HOME && node apps/api/dist/index.js"
    echo "  Open: http://localhost:$TMUAPP_PORT"
    ;;
esac

echo ""
info "tmuapp installed successfully! 🚀"
