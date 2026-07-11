#!/bin/sh
set -e
python manage.py migrate --noinput
python manage.py seed_erp_auth
python manage.py seed_erp_realtime
python manage.py seed_erp_devices
python manage.py seed_erp_notifications
python manage.py seed_erp_approvals
python manage.py seed_erp_documents
python manage.py seed_erp_customization
python manage.py seed_erp_backup
python manage.py seed_erp_security
python manage.py seed_erp_ops
python manage.py seed_erp_hardening
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
