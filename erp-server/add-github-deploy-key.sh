#!/usr/bin/env bash
# Run once on the VPS as root (aaPanel Terminal). Enables GitHub Actions "Deploy VPS".
set -euo pipefail
PUB='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFRFxXTqkRhsjy4jtlnoLUuC1iuOdawkQUdq6lgPP5ar admin@DESKTOP-JUSJ7FT'
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
grep -qF "${PUB}" /root/.ssh/authorized_keys || echo "$PUB" >> /root/.ssh/authorized_keys
echo "github_deploy key installed."
