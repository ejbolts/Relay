#!/usr/bin/env bash
# Update Gym Logger on the VM: back up, pull the latest commit, reinstall, rebuild the PWA, restart.
#
# Usage (on the VM):
#   sudo bash /opt/gym-logger/deploy/update.sh
#
# Options (set as environment variables through env, because sudo strips most of them):
#   sudo env SKIP_FRONTEND_BUILD=1 bash /opt/gym-logger/deploy/update.sh
#     Skip the PWA rebuild. Use this when you built frontend/dist on another machine and copied it in
#     (useful on the 1 GB AMD shape). The copied dist must be complete, or the phone app will break.
#   sudo env SKIP_BACKUP=1 bash /opt/gym-logger/deploy/update.sh
#     Skip the pre-update backup. Not recommended.
#
# Database migrations are not run here. The systemd unit runs `alembic upgrade head` as ExecStartPre,
# so each restart applies pending migrations before the server starts.

set -euo pipefail

APP_DIR="/opt/gym-logger"
SERVICE="gym-logger"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Run with sudo: sudo bash ${APP_DIR}/deploy/update.sh"
[[ -d "$APP_DIR/.git" ]] || die "${APP_DIR} is not a git checkout. Run deploy/setup-ubuntu.sh first."
[[ -x "$APP_DIR/.venv/bin/python" ]] || die "The virtualenv is missing. Run deploy/setup-ubuntu.sh first."

if [[ "${SKIP_BACKUP:-0}" != "1" ]]; then
  log "Backing up the database and data before updating"
  bash "$APP_DIR/deploy/backup.sh"
else
  warn "SKIP_BACKUP=1: continuing without a backup"
fi

log "Pulling the latest commit"
# `pip install -e` rewrites the egg-info metadata that is tracked in git; discard the regenerated copies first.
git -C "$APP_DIR" checkout -- backend/gym_video_logger.egg-info 2>/dev/null || true
before="$(git -C "$APP_DIR" rev-parse --short HEAD)"
git -C "$APP_DIR" pull --ff-only
after="$(git -C "$APP_DIR" rev-parse --short HEAD)"
echo "Commit: ${before} -> ${after}"

log "Reinstalling the backend (editable) and alembic"
"$APP_DIR/.venv/bin/python" -m pip install -e "$APP_DIR" "alembic>=1.14,<2"

if [[ "${SKIP_FRONTEND_BUILD:-0}" == "1" ]]; then
  warn "SKIP_FRONTEND_BUILD=1: using the existing frontend/dist"
else
  command -v npm >/dev/null 2>&1 || die "npm is missing. Run deploy/setup-ubuntu.sh again."
  log "Rebuilding the PWA"
  (
    cd "$APP_DIR/frontend"
    npm install --no-package-lock
    npm run build
  )
fi

log "Restarting ${SERVICE} (migrations run automatically)"
systemctl restart "$SERVICE"

healthy=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if (( healthy )); then
  log "Update complete; the backend is healthy"
else
  die "The backend did not answer /api/health. Check: sudo journalctl -u ${SERVICE} -n 100 --no-pager"
fi
