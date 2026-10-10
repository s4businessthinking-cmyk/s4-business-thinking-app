#!/usr/bin/env bash
# Pull the mobile/web OTA bundle from GitHub Releases and unpack to the aaPanel site root.
# Run on VPS as root (often called from vps-update.sh).
set -euo pipefail

REPO="${S4_GITHUB_REPO:-s4businessthinking-cmyk/s4-business-thinking-app}"
WEB_ROOT="${S4_WEB_ROOT:-/www/wwwroot/erp.s4businessthinking.com}"
VERSION="${S4_WEB_VERSION:-}"

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  die "Run as root"
fi

if [ -z "$VERSION" ]; then
  say "Resolve latest release tag from GitHub"
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  VERSION="${TAG#v}"
fi

[ -n "$VERSION" ] || die "Could not resolve release version"

ZIP="S4-Business-Thinking-${VERSION}-bundle.zip"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ZIP}"

say "Download ${URL}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "${TMP}/${ZIP}" "$URL"
command -v unzip >/dev/null || die "install unzip (aaPanel package manager)"

mkdir -p "$WEB_ROOT"
# Keep a quick rollback copy of index.html only
if [ -f "${WEB_ROOT}/index.html" ]; then
  cp -a "${WEB_ROOT}/index.html" "${WEB_ROOT}/index.html.bak.$(date +%Y%m%d%H%M)" || true
fi

say "Unpack to ${WEB_ROOT}"
unzip -oq "${TMP}/${ZIP}" -d "${WEB_ROOT}"

say "Website files updated to v${VERSION}"
ls -la "${WEB_ROOT}/index.html" "${WEB_ROOT}/assets/" 2>/dev/null | head -5 || true
