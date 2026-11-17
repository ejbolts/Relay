#!/usr/bin/env bash
# Back up Gym Logger: a consistent SQLite snapshot plus machine photos, the Web Push key,
# the secrets directory and .env, in one gzip archive.
#
# Usage (as root):
#   sudo bash /opt/gym-logger/deploy/backup.sh
#
# Output: /var/backups/gym-logger/gym-logger-YYYYmmdd-HHMMSS.tar.gz (directory mode 0700).
# Override with environment variables when you run it:
#   GYM_BACKUP_DIR=/some/other/dir   GYM_BACKUP_KEEP_DAYS=30
#
# Restore (stop the app first: sudo systemctl stop gym-logger):
#   sudo tar -xzf <archive> -C /tmp/restore
#   sudo install -o gymlogger -g gymlogger -m 640 /tmp/restore/gym-video-logger.db /opt/gym-logger/data/gym-video-logger.db
#   sudo rsync -a /tmp/restore/data/ /opt/gym-logger/data/      # machine photos and the VAPID key
#   sudo rsync -a /tmp/restore/secrets/ /opt/gym-logger/secrets/   # only if the archive has secrets/
#   sudo install -o root -g gymlogger -m 640 /tmp/restore/.env /opt/gym-logger/.env   # only if restoring .env
#   sudo chown -R gymlogger:gymlogger /opt/gym-logger/data /opt/gym-logger/secrets
#   sudo systemctl start gym-logger
#
# This archive lives on the same boot volume as the app. Copy it off the VM regularly
# so a failed disk does not take the backups with it.

set -euo pipefail
umask 077
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

APP_DIR="${GYM_APP_DIR:-/opt/gym-logger}"
BACKUP_DIR="${GYM_BACKUP_DIR:-/var/backups/gym-logger}"
KEEP_DAYS="${GYM_BACKUP_KEEP_DAYS:-14}"
# Must match GYM_DATABASE_PATH in .env (deploy/env.production.example uses this path).
DB="${APP_DIR}/data/gym-video-logger.db"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Run as root (sudo) so every file can be read."
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 is not installed (sudo apt-get install sqlite3)"
[[ -f "$DB" ]] || die "Database not found at ${DB}"
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || die "GYM_BACKUP_KEEP_DAYS must be a whole number of days"

install -d -m 700 "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="${BACKUP_DIR}/gym-logger-${stamp}.tar.gz"
work="$(mktemp -d "${BACKUP_DIR}/.work-XXXXXX")"
trap 'rm -rf "$work"' EXIT

# 1. Consistent snapshot. The SQLite backup API is safe while the app is running.
#    Stdin is used so the .backup target can contain spaces.
log "Snapshotting ${DB}"
printf '.timeout 30000\n.backup %s\n' "'${work}/gym-video-logger.db'" | sqlite3 -batch "$DB"

check="$(sqlite3 "${work}/gym-video-logger.db" 'PRAGMA integrity_check;')"
[[ "$check" == "ok" ]] || die "Snapshot failed integrity_check: ${check}"

# 2. Everything else that is needed to run the same instance again.
sources=()
for item in data/machine-photos data/web-push-vapid-private.pem secrets .env; do
  if [[ -e "${APP_DIR}/${item}" ]]; then
    sources+=("$item")
  fi
done

# 3. Archive. GNU tar's -C applies to the names that follow it, so both trees end up in one archive.
#    Exit status 1 means "a file changed while being read" (for example, a photo uploaded mid-backup).
#    That is acceptable here, so only other failures stop the script.
log "Writing ${out}"
set +e
tar -czf "${out}.partial" -C "$work" gym-video-logger.db -C "$APP_DIR" "${sources[@]}"
rc=$?
set -e
if (( rc != 0 && rc != 1 )); then
  rm -f "${out}.partial"
  die "tar failed with status ${rc}"
fi
mv "${out}.partial" "$out"

# 4. Prune old archives.
find "$BACKUP_DIR" -maxdepth 1 -name 'gym-logger-*.tar.gz' -mtime +"$KEEP_DAYS" -print -delete

log "Backup complete: ${out} ($(du -h "$out" | cut -f1))"
