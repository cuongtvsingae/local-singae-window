#!/bin/sh
set -e

cd /app

if [ ! -f private/.env ]; then
  echo "WARNING: private/.env not found."
  echo "  Mount: -v \"\$(pwd)/private:/app/private\""
  echo "  Or:    cp private/.env.example private/.env"
fi

exec pm2-runtime ecosystem.config.cjs
