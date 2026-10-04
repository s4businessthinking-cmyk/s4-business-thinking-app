#!/usr/bin/env bash
# Puts the whole S4 ERP database back from a backup.sh dump (.sql.gz).
# Usage: restore.sh /path/to/s4erp-YYYYmmdd-HHMM.sql.gz
# The current database is dumped first, so a restore can itself be undone.
set -euo pipefail
FILE="${1:-}"
ENV=/www/s4erp/s4-erp-server/.env
APP_DIR=/www/s4erp/s4-erp-server

[ -f "$FILE" ] || { echo "backup file not found: $FILE" >&2; exit 1; }
gzip -t "$FILE" || { echo "backup file is damaged (gzip check failed)" >&2; exit 1; }
zcat "$FILE" | grep -q 'CREATE TABLE `documents`' || { echo "not an S4 ERP database backup" >&2; exit 1; }

get() { grep -E "^$1=" "$ENV" | head -1 | cut -d= -f2-; }
CNF=$(mktemp)
SRC=$(mktemp)
trap 'rm -f "$CNF" "$SRC"' EXIT
chmod 600 "$CNF" "$SRC"
cp "$FILE" "$SRC"
printf '[client]\nuser=%s\npassword=%s\nhost=127.0.0.1\n' "$(get MYSQL_USER)" "$(get MYSQL_PASSWORD)" > "$CNF"
DB="$(get MYSQL_DATABASE)"

echo "1/4 safety backup of the current database..."
/www/s4erp/backup.sh || echo "   (current database could not be dumped; continuing)"

echo "2/4 stopping the ERP server..."
cd "$APP_DIR"
docker compose stop

echo "3/4 importing $FILE ..."
if ! zcat "$SRC" | mysql --defaults-extra-file="$CNF" "$DB"; then
  echo "import FAILED - starting the server again with whatever is in the database" >&2
  docker compose start
  exit 1
fi

echo "4/4 starting the ERP server..."
docker compose start
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8710/health >/dev/null 2>&1; then
    echo "restore ok: $(mysql --defaults-extra-file="$CNF" -N -e 'SELECT COUNT(*) FROM documents' "$DB") documents, $(mysql --defaults-extra-file="$CNF" -N -e 'SELECT COUNT(*) FROM accounts' "$DB") accounts"
    exit 0
  fi
  sleep 1
done
echo "server did not come back healthy - check: docker logs s4erp" >&2
exit 1
