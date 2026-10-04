#!/usr/bin/env bash
# One-shot installer / updater for the S4 ERP server on the VPS.
# Usage (from this folder, as root):  bash install.sh
# Re-running it later updates the server and keeps the existing .env.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash install.sh"
command -v docker >/dev/null || die "Docker is not installed (aaPanel -> App Store -> Docker)."
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null; then
  DC="docker-compose"
else
  die "docker compose is not available."
fi

if [ ! -f .env ]; then
  say "Database settings (from aaPanel -> Databases)"
  read -rp "Database name [s4erp]: " DBN; DBN=${DBN:-s4erp}
  read -rp "Database username [s4erp]: " DBU; DBU=${DBU:-s4erp}
  read -rsp "Database password (hidden while typing): " DBP; echo
  [ -n "$DBP" ] || die "Database password is required."
  case "$DBP" in *"'"*|*'$'*|*' '*) die "Use a password without spaces, quotes or \$ (aaPanel's generated password is fine)." ;; esac
  SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')
  umask 077
  cat > .env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=8710
DB_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=$DBU
MYSQL_PASSWORD='$DBP'
MYSQL_DATABASE=$DBN
JWT_SECRET=$SECRET
EOF
  say ".env created"
else
  say "Keeping existing .env"
fi

if ss -tln | grep -q ':8710 ' && ! docker ps --format '{{.Names}}' | grep -qx s4erp; then
  die "Port 8710 is already used by another program."
fi

if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ] && [ ! -f /swapfile ]; then
  say "Adding 2 GB swap (server has little RAM)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Building and starting the S4 ERP server"
$DC up -d --build

say "Waiting for the server to answer"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8710/health >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8710/health; echo
    printf '\n\033[1;32mS4 ERP server is running.\033[0m\n'
    echo "Next: aaPanel -> Website -> add erp.s4businessthinking.com, SSL, reverse proxy to http://127.0.0.1:8710"
    exit 0
  fi
  sleep 2
done

docker logs s4erp --tail 40 || true
die "Server did not start. Send a screenshot of the lines above."
