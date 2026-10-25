#!/usr/bin/env bash
# First-time setup of Gym Logger on Ubuntu 24.04 (Oracle Cloud Always Free Ampere A1 or AMD Micro).
#
# Usage, on the VM:
#   sudo bash /opt/gym-logger/deploy/setup-ubuntu.sh <domain> <repo-url> [branch]
#
#   sudo bash deploy/setup-ubuntu.sh gym.example.com https://github.com/ejbolts/Relay.git main
#
# The repo is cloned into /opt/gym-logger when it is not there yet. If you run this script from a
# checkout that is already in /opt/gym-logger, the repo-url argument is still required; the script
# then fetches and fast-forwards the requested branch.
#
# Safe to run again: each step checks whether it already happened. Re-running it also
# refreshes the systemd unit and the Caddyfile from the repo copies.
#
# An existing /opt/gym-logger/.env keeps its values; the script only fixes its ownership and mode.

set -euo pipefail

APP_USER="gymlogger"
APP_DIR="/opt/gym-logger"
NODE_MAJOR="24"          # Node 20 reached end of life in April 2026. Any Node >= 20 is accepted if already installed.
SWAP_FILE="/swapfile"
SWAP_SIZE_GB="4"
LOW_RAM_KB=$((2 * 1024 * 1024))   # Add swap below 2 GiB of RAM.

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

DOMAIN="${1:-}"
REPO_URL="${2:-}"
BRANCH="${3:-main}"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Run this script with sudo: sudo bash deploy/setup-ubuntu.sh <domain> <repo-url> [branch]"
[[ -n "$DOMAIN" && -n "$REPO_URL" ]] || die "Usage: sudo bash deploy/setup-ubuntu.sh <domain> <repo-url> [branch]"
[[ "$DOMAIN" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || die "'$DOMAIN' is not a hostname such as gym.example.com"

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  warn "This script targets Ubuntu 24.04; detected ${PRETTY_NAME:-unknown}. Continuing anyway."
fi
log "Setting up Gym Logger for https://${DOMAIN} (branch ${BRANCH}) on $(uname -m)"

# ---------------------------------------------------------------------------
# 1. Swap for small-memory shapes (AMD E2.1.Micro has 1 GB RAM)
# ---------------------------------------------------------------------------
ensure_swap() {
  local mem_kb
  mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if (( mem_kb >= LOW_RAM_KB )); then
    log "RAM is ${mem_kb} kB; swap file not needed"
    return
  fi
  if [[ -n "$(swapon --show --noheadings)" ]]; then
    log "Swap is already enabled; leaving it alone"
    return
  fi
  log "RAM is under 2 GiB; creating a ${SWAP_SIZE_GB} GB swap file at ${SWAP_FILE}"
  if [[ ! -e "$SWAP_FILE" ]]; then
    fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$((SWAP_SIZE_GB * 1024))" status=none
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE" >/dev/null
  fi
  swapon "$SWAP_FILE"
  grep -qF "$SWAP_FILE" /etc/fstab || echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
}

# ---------------------------------------------------------------------------
# 2. Base packages
# ---------------------------------------------------------------------------
install_packages() {
  log "Installing system packages"
  apt-get update
  # Pre-answer the iptables-persistent prompt so apt stays non-interactive.
  echo 'iptables-persistent iptables-persistent/autosave_v4 boolean true' | debconf-set-selections
  echo 'iptables-persistent iptables-persistent/autosave_v6 boolean true' | debconf-set-selections
  apt-get install -y --no-install-recommends \
    python3.12 python3.12-venv ffmpeg git curl ca-certificates gnupg \
    debian-keyring debian-archive-keyring apt-transport-https \
    sqlite3 rsync openssl unattended-upgrades \
    iptables-persistent netfilter-persistent

  # Security updates install automatically.
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
}

# ---------------------------------------------------------------------------
# 3. Node.js (NodeSource)
# ---------------------------------------------------------------------------
install_node() {
  local current=""
  if command -v node >/dev/null 2>&1; then
    current="$(node -p 'process.versions.node.split(".")[0]')"
  fi
  if [[ -n "$current" ]] && (( current >= 20 )); then
    log "Node.js ${current} is already installed"
  else
    log "Installing Node.js ${NODE_MAJOR}.x from NodeSource"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
    bash /tmp/nodesource_setup.sh
    rm -f /tmp/nodesource_setup.sh
    apt-get install -y nodejs
  fi
}

# ---------------------------------------------------------------------------
# 4. Caddy from the official Cloudsmith repository
# ---------------------------------------------------------------------------
install_caddy() {
  log "Installing Caddy from the official Caddy apt repository"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
}

# ---------------------------------------------------------------------------
# 5. Service user, code, data directories
# ---------------------------------------------------------------------------
ensure_user() {
  if id -u "$APP_USER" >/dev/null 2>&1; then
    log "User ${APP_USER} already exists"
  else
    log "Creating system user ${APP_USER}"
    useradd --system --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  fi
}

# `pip install -e` rewrites the egg-info metadata that is tracked in git. Discard the regenerated copies
# so git can switch branches and fast-forward. Nothing else on the server should be modified in the tree.
discard_generated_files() {
  git -C "$APP_DIR" checkout -- backend/gym_video_logger.egg-info 2>/dev/null || true
}

ensure_repo() {
  if [[ -d "$APP_DIR/.git" ]]; then
    log "Updating the existing checkout in ${APP_DIR} (branch ${BRANCH})"
    discard_generated_files
    git -C "$APP_DIR" fetch --prune origin
    git -C "$APP_DIR" checkout -q "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  elif [[ -d "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
    die "${APP_DIR} exists and is not a git checkout. Move it aside, then run this script again."
  else
    log "Cloning ${REPO_URL} (branch ${BRANCH}) into ${APP_DIR}"
    install -d -m 755 "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

# Code stays owned by root so the service user cannot modify it. Only data/ and secrets/ are writable.
ensure_directories() {
  log "Creating data and secrets directories owned by ${APP_USER}"
  install -d -o "$APP_USER" -g "$APP_USER" -m 750 \
    "$APP_DIR/data" "$APP_DIR/data/machine-photos" "$APP_DIR/data/cache" \
    "$APP_DIR/data/uploads" "$APP_DIR/data/normalized" "$APP_DIR/data/outputs" \
    "$APP_DIR/secrets"
}

# ---------------------------------------------------------------------------
# 6. Python virtualenv (alembic is installed explicitly because the runtime needs it)
# ---------------------------------------------------------------------------
install_backend() {
  command -v python3.12 >/dev/null 2>&1 || die "python3.12 was not installed by apt"
  if [[ ! -x "$APP_DIR/.venv/bin/python" ]]; then
    log "Creating the Python 3.12 virtualenv"
    python3.12 -m venv "$APP_DIR/.venv"
  fi
  log "Installing the backend (editable, so frontend/dist is found next to the source)"
  "$APP_DIR/.venv/bin/python" -m pip install --upgrade pip
  # alembic is only listed in the dev extras of pyproject.toml, but the systemd unit runs
  # `alembic upgrade head` on every start, so it must be installed here.
  "$APP_DIR/.venv/bin/python" -m pip install -e "$APP_DIR" "alembic>=1.14,<2"
}

# ---------------------------------------------------------------------------
# 7. PWA build
# ---------------------------------------------------------------------------
build_frontend() {
  log "Installing frontend dependencies and building the PWA (this can take several minutes)"
  (
    cd "$APP_DIR/frontend"
    # Matches start-app.ps1, which builds with npm without writing a lockfile.
    npm install --no-package-lock
    npm run build
  )
  [[ -f "$APP_DIR/frontend/dist/index.html" ]] || die "The frontend build did not produce frontend/dist/index.html"
}

# ---------------------------------------------------------------------------
# 8. Environment file (never overwritten)
# ---------------------------------------------------------------------------
ensure_env() {
  if [[ ! -f "$APP_DIR/.env" ]]; then
    log "Creating ${APP_DIR}/.env from deploy/env.production.example"
    install -m 640 "$APP_DIR/deploy/env.production.example" "$APP_DIR/.env"
  else
    log ".env already exists; leaving its values unchanged"
  fi
  # Root owns the file and the service group can read it. The app reads .env from its working directory.
  chown root:"$APP_USER" "$APP_DIR/.env"
  chmod 640 "$APP_DIR/.env"
}

env_has_placeholders() {
  grep -Eq 'change-me|you@example\.com' "$APP_DIR/.env"
}

# ---------------------------------------------------------------------------
# 9. systemd and Caddy
# ---------------------------------------------------------------------------
install_units() {
  log "Installing the systemd unit"
  install -m 644 "$APP_DIR/deploy/gym-logger.service" /etc/systemd/system/gym-logger.service
  systemctl daemon-reload
  systemctl enable gym-logger.service

  log "Installing the Caddyfile for ${DOMAIN}"
  # DOMAIN is validated above to contain only letters, digits, dots and hyphens, so it is safe in sed.
  sed "s/gym\.example\.com/${DOMAIN}/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
  chmod 644 /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

# ---------------------------------------------------------------------------
# 10. Firewall: Oracle's Ubuntu image ends INPUT with a REJECT rule, so ACCEPT rules must come before it.
# ---------------------------------------------------------------------------
open_port() {
  local ipt="$1" port="$2" reject_line=""
  if "$ipt" -C INPUT -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    return
  fi
  # The REJECT line number is looked up each time, so inserting one rule does not shift the position we use.
  reject_line="$("$ipt" -L INPUT --line-numbers -n | awk '$2 == "REJECT" && $3 == "all" && !found {print $1; found=1}' || true)"
  if [[ -n "$reject_line" ]]; then
    log "Opening TCP ${port} in ${ipt} before the REJECT rule (line ${reject_line})"
    "$ipt" -I INPUT "$reject_line" -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT
  else
    log "Opening TCP ${port} in ${ipt}"
    "$ipt" -A INPUT -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT
  fi
}

open_firewall() {
  local ufw_status=""
  if command -v ufw >/dev/null 2>&1; then
    ufw_status="$(ufw status 2>/dev/null || true)"
  fi
  if [[ "$ufw_status" == *"Status: active"* ]]; then
    log "ufw is active; allowing 80 and 443"
    ufw allow 80/tcp
    ufw allow 443/tcp
  fi

  local port
  for port in 80 443; do
    open_port iptables "$port"
  done
  if command -v ip6tables >/dev/null 2>&1; then
    for port in 80 443; do
      open_port ip6tables "$port"
    done
  fi

  # Persist across reboots (iptables-persistent is installed above).
  netfilter-persistent save
}

# ---------------------------------------------------------------------------
# 11. Start everything
# ---------------------------------------------------------------------------
start_services() {
  systemctl enable caddy
  systemctl restart caddy

  if env_has_placeholders; then
    warn "The app was NOT started: $APP_DIR/.env still contains placeholder values."
    warn "Edit it (for example: sudo nano $APP_DIR/.env), then run: sudo systemctl restart gym-logger"
    warn "Replace GYM_REGISTRATION_INVITE_CODE (run: openssl rand -base64 24) and GYM_WEB_PUSH_CONTACT_EMAIL."
    return
  fi

  log "Starting the app (migrations run automatically)"
  systemctl restart gym-logger

  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 3 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
      log "Backend is healthy on 127.0.0.1:8000"
      return
    fi
    sleep 2
  done
  warn "The backend did not answer /api/health. Check: sudo journalctl -u gym-logger -n 100 --no-pager"
}

main() {
  ensure_swap
  install_packages
  install_node
  install_caddy
  ensure_user
  ensure_repo
  ensure_directories
  install_backend
  build_frontend
  ensure_env
  install_units
  open_firewall
  start_services

  cat <<EOF

Setup finished.
  Site:          https://${DOMAIN}  (DNS must point at this VM's reserved public IP)
  App logs:      sudo journalctl -u gym-logger -f
  Caddy logs:    sudo journalctl -u caddy -f
  Update:        sudo bash ${APP_DIR}/deploy/update.sh
  Backups:       sudo bash ${APP_DIR}/deploy/backup.sh
  Admin CLI:     cd ${APP_DIR} && sudo -u ${APP_USER} .venv/bin/python -m app.manage list-users

Next: open https://${DOMAIN} in a browser and create the first account with your invite code.
The first account becomes the admin and claims any existing data.
EOF
}

main "$@"
