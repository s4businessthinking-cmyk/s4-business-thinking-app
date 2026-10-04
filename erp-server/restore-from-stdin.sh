#!/usr/bin/env bash
# Forced command for the "s4-restore" SSH key: the only thing that key can do
# is stream a .sql.gz backup on stdin and have restore.sh put it back.
set -euo pipefail
MAX_BYTES=$((500 * 1024 * 1024))
case "${SSH_ORIGINAL_COMMAND:-}" in
  restore)
    TMP=$(mktemp /tmp/s4-restore-XXXXXX.sql.gz)
    trap 'rm -f "$TMP"' EXIT
    head -c "$MAX_BYTES" > "$TMP"
    /www/s4erp/restore.sh "$TMP"
    ;;
  *)
    echo "allowed: restore" >&2
    exit 1
    ;;
esac
