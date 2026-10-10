#!/usr/bin/env bash
# Update S4 ERP server on the VPS from GitHub (run as root in aaPanel Terminal).
#   curl -fsSL "https://raw.githubusercontent.com/s4businessthinking-cmyk/s4-business-thinking-app/main/erp-server/vps-update.sh" | bash
set -euo pipefail

BASE="${S4_ERP_BASE:-/www/s4erp}"
LEGACY="${S4_ERP_LEGACY_DIR:-$BASE/s4-erp-server}"
REPO="${S4_ERP_REPO_DIR:-$BASE/s4-business-thinking-app}"
ERP="$REPO/erp-server"
REPO_URL="${S4_ERP_REPO_URL:-https://github.com/s4businessthinking-cmyk/s4-business-thinking-app.git}"

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  die "Run as root: sudo bash vps-update.sh"
fi

mkdir -p "$BASE"

migrate_env() {
  local target="$ERP/.env"
  [ -f "$target" ] && return 0
  if [ -f "$LEGACY/.env" ]; then
    say "Keeping database settings from $LEGACY/.env"
    cp -a "$LEGACY/.env" "$target"
    return 0
  fi
  if [ -f "$BASE/s4erp.env.migrate" ]; then
    cp -a "$BASE/s4erp.env.migrate" "$target"
  fi
}

ensure_git_repo() {
  if [ -d "$REPO/.git" ]; then
    return 0
  fi
  say "First-time setup: git clone (main)"
  if [ -f "$LEGACY/.env" ]; then
    cp -a "$LEGACY/.env" "$BASE/s4erp.env.migrate"
  fi
  if ! command -v git >/dev/null; then
    die "git is not installed. aaPanel -> App Store -> install git, then re-run."
  fi
  git clone --depth 1 --branch main "$REPO_URL" "$REPO"
  migrate_env
}

pull_repo() {
  ensure_git_repo
  cd "$REPO"
  say "Git pull (main)"
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
  migrate_env
}

workdir() {
  if [ -f "$ERP/install.sh" ]; then
    echo "$ERP"
    return
  fi
  if [ -f "$LEGACY/install.sh" ]; then
    echo "$LEGACY"
    return
  fi
  die "erp-server/install.sh not found under $REPO or $LEGACY"
}

if [ ! -d "$LEGACY" ] && [ ! -d "$REPO" ]; then
  die "Expected $LEGACY or $REPO — create $BASE first or set S4_ERP_BASE."
fi

pull_repo
DIR="$(workdir)"
cd "$DIR"

say "Docker rebuild ($DIR)"
bash install.sh

say "Health"
curl -fsS http://127.0.0.1:8710/health
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/deploy-website.sh" ]; then
  say "Website (GitHub release bundle → aaPanel web root)"
  bash "${SCRIPT_DIR}/deploy-website.sh"
else
  echo "Tip: run deploy-website.sh to sync erp.s4businessthinking.com to latest release."
fi

echo "VPS ERP server updated."
echo "Git repo: $REPO"
echo "Run folder: $DIR"
