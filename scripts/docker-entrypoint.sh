#!/bin/sh
set -e

cd /app

if [ ! -f private/.env ]; then
  echo "⚠️  private/.env not found."
  echo "    Mount it:  -v \"\$(pwd)/private:/app/private\""
  echo "    Or copy:   cp private/.env.example private/.env"
fi

exec pm2-runtime ecosystem.config.cjs
