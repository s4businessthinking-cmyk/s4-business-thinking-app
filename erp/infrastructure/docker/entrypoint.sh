#!/bin/sh
set -e
python manage.py migrate --noinput
python manage.py seed_erp_auth
python manage.py seed_erp_realtime
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
