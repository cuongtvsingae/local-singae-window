# singae-local — tool hub + chatbot engine (4 processes via PM2)
FROM node:20-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Root dependencies (sqlite3, bcrypt in nested packages need native build)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Nested runtime packages (it-support, …)
COPY scripts/bootstrap.js ./scripts/bootstrap.js
COPY tools/it-support/package.json tools/it-support/package-lock.json ./tools/it-support/
RUN node scripts/bootstrap.js

# Application source
COPY . .

# PM2 runs all 4 apps in foreground (Docker-friendly)
# Strip CRLF from shell scripts (Windows checkout) — avoids "no such file or directory"
RUN npm install -g pm2@5 --no-audit --no-fund \
  && sed -i 's/\r$//' scripts/docker-entrypoint.sh \
  && chmod +x scripts/docker-entrypoint.sh

ENV NODE_ENV=production \
  PORT=3000 \
  LISTEN_HOST=0.0.0.0 \
  CHATBOT_LOCAL_SERVER_PORT=13001 \
  CHATBOT_LOCAL_PROCESS_PORT=13000

EXPOSE 3000 13001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
