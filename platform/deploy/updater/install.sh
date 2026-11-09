#!/usr/bin/env bash
# Installs the Health Rider host updater on the application server. Run once as root, and again after
# a version that changes the updater itself:
#   sudo bash /opt/health-rider/platform/deploy/updater/install.sh
# The script is copied out of the checkout, because the updater checks out other versions while it runs.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
state_dir="${HR_STATE_DIR:-/var/lib/health-rider-updater}"
env_file=/etc/health-rider-updater.env

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
command -v python3 >/dev/null || { echo "python3 is required." >&2; exit 1; }
command -v mariadb-dump >/dev/null || command -v mysqldump >/dev/null || echo "Warning: mariadb-client is not installed, so database backups will fail (apt install mariadb-client)." >&2

install -d -m 0755 /usr/local/lib/health-rider-updater
install -m 0755 "$here/health-rider-updater.py" /usr/local/lib/health-rider-updater/health-rider-updater.py
install -m 0644 "$here/health-rider-updater.service" /etc/systemd/system/health-rider-updater.service
install -m 0644 "$here/health-rider-updater.timer" /etc/systemd/system/health-rider-updater.timer

# The web container runs as uid 1001 with no matching group, so that uid owns the folder and may
# write request.json into it. root (the updater) needs no permission bits.
install -d -o 1001 -g 0 -m 0770 "$state_dir"

# With SELinux enforcing (Rocky, AlmaLinux, RHEL) a container may only use files labelled container_file_t.
if command -v selinuxenabled >/dev/null && selinuxenabled; then
  if command -v semanage >/dev/null; then
    semanage fcontext -a -t container_file_t "$state_dir(/.*)?" 2>/dev/null \
      || semanage fcontext -m -t container_file_t "$state_dir(/.*)?"
    restorecon -R "$state_dir"
  else
    echo "Note: semanage not found (dnf install policycoreutils-python-utils); labelling with chcon, which a full relabel would undo." >&2
    chcon -R -t container_file_t "$state_dir"
  fi
fi
install -d -o root -g root -m 0700 /var/backups/health-rider

if [[ ! -f $env_file ]]; then
  cat > "$env_file" <<CONF
# Settings for health-rider-updater (see docs/operations/system-updates.md).
HR_REPO_DIR=$repo
HR_STATE_DIR=$state_dir
# The address the updater checks after an update; it must answer /api/version under the app's path.
HR_HEALTH_URL=http://127.0.0.1:3000/health-rider/api/version
HR_BACKUP=required
HR_BACKUP_DIR=/var/backups/health-rider
HR_BACKUP_KEEP=14
CONF
  chmod 0644 "$env_file"
  echo "Wrote $env_file; check HR_HEALTH_URL if WEB_PUBLISH in .env.production is not 127.0.0.1:3000."
fi

# The app finds the folder through UPDATER_STATE_DIR in .env.production (compose mounts it at /app/updater).
app_env="$repo/platform/.env.production"
if [[ -f $app_env ]] && ! grep -q '^UPDATER_STATE_DIR=' "$app_env"; then
  printf '\n# Shared with the host updater (deploy/updater).\nUPDATER_STATE_DIR=%s\n' "$state_dir" >> "$app_env"
fi

systemctl daemon-reload
systemctl enable --now health-rider-updater.timer
systemctl start health-rider-updater.service || true
echo "Installed. Status: systemctl status health-rider-updater.timer · Log: journalctl -u health-rider-updater -n 50"
