# singae-local

Tool UIs + chatbot engine on your LAN. Simly tokens and Facebook webhooks run on **VPS** (`../vps`).

## Setup

```bash
cd local
cp private/.env.example private/.env
npm install
npm run setup
npm start
```

Chi tiết build & test local → **VPS production**: **[TEST.md](./TEST.md)**.

Open http://localhost:3000

## Chạy tất cả bằng PM2 (1 lệnh)

Cần [PM2](https://pm2.keymetrics.io/) (`npm install -g pm2`).

```bash
cd local
npm run pm2:start
```

Hoặc trong folder `local`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Dừng / xem log:

```bash
npm run pm2:stop
npm run pm2:logs
npm run pm2:status
```

4 process: hub `:3000`, engine `:13001`, processor `:13000`, worker (SSE → VPS).

## Chatbot (từng terminal — nếu không dùng PM2)

```bash
npm run chatbot-local:server
npm run chatbot-local:processor
npm run chatbot-local:worker
```

## Env

- `SIMLY_PUBLIC_BASE_URL` — VPS origin (default `https://singae.cloud`)
- `CHATBOT_MANAGER_BASE_URL` — VPS bridge SSE
- `OPENAI_*` — local LLM
- `SKIP_SIMLY_TOKEN_REFRESH=1` — commission settings only; tokens on VPS
