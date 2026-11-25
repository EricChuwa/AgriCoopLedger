#!/bin/sh
# Start command for the hosted service. Creates tables on start (see app/main.py). With SEED_DEMO=true
# it also loads the synthetic demo cooperative once; it does nothing if that cooperative already exists.
set -e
if [ "$SEED_DEMO" = "true" ]; then
  python -m app.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
