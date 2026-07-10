#!/bin/sh
set -e
python manage.py migrate --noinput
python manage.py seed_erp_auth
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120 --access-logfile - --error-logfile -
