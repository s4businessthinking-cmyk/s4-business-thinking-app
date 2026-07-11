#!/bin/sh
# Production entrypoint (STAGE 15 §16.5/§16.8).
# Only the "web" service sets RUN_MIGRATIONS=1 so migrations + seeds run exactly
# once; ws/worker/beat containers start immediately after web is healthy.
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] applying migrations..."
  python manage.py migrate --noinput

  echo "[entrypoint] collecting static..."
  python manage.py collectstatic --noinput

  echo "[entrypoint] seeding (idempotent)..."
  for app in auth tenancy sync inventory purchase sales accounting hrm_crm \
             reports realtime devices notifications approvals documents \
             customization backup security ops hardening; do
    python manage.py "seed_erp_${app}"
  done
fi

exec "$@"
