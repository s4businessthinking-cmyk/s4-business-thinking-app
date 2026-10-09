#!/usr/bin/env bash
# Update S4 ERP server on the VPS from GitHub (run as root in aaPanel Terminal).
#   curl -fsSL "https://raw.githubusercontent.com/s4businessthinking-cmyk/s4-business-thinking-app/main/erp-server/vps-update.sh" | bash
set -euo pipefail

APP="${S4_ERP_APP_DIR:-/www/s4erp/s4-erp-server}"
say() { printf '\n==> %s\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash vps-update.sh" >&2
  exit 1
fi

if [ ! -d "$APP" ]; then
  echo "App folder not found: $APP" >&2
  exit 1
fi

cd "$APP"
WORK="$APP"
if [ -f erp-server/install.sh ]; then
  WORK="$APP/erp-server"
  cd "$WORK"
fi

if [ ! -d "$APP/.git" ] && [ ! -d "$WORK/.git" ]; then
  echo "No git repo under $APP — clone first, then re-run." >&2
  exit 1
fi

if [ -d "$APP/.git" ]; then
  cd "$APP"
fi

say "Git pull (main)"
git fetch origin main
git checkout main
git pull --ff-only origin main

if [ -f erp-server/install.sh ]; then
  cd erp-server
fi

say "Docker rebuild"
bash install.sh

say "Health"
curl -fsS http://127.0.0.1:8710/health
echo ""
echo "VPS ERP server updated."
