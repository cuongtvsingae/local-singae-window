# Docker — singae-local

Chạy **4 process** (hub `:3000`, chatbot engine `:13001`, processor `:13000`, worker SSE) trong một container, tương đương `npm run pm2:start`.

## Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) hoặc Docker Engine + Compose (Linux)
- File cấu hình `private/.env` (copy từ `private/.env.example`)
- Máy/container **có internet** tới VPS (`https://singae.cloud` mặc định)
- `OPENAI_API_KEY` nếu cần test trả lời chatbot

## 1. Chuẩn bị `.env`

```powershell
cd C:\Users\Admin\Documents\local-singae-window
copy private\.env.example private\.env
notepad private\.env
```

Giữ các URL VPS production (mặc định trong `.env.example`):

```env
SIMLY_PUBLIC_BASE_URL=https://singae.cloud
CHATBOT_MANAGER_BASE_URL=https://singae.cloud/api/chatbot-manager
USE_VPS_FB_BRIDGE=1
OPENAI_API_KEY=sk-...
```

Trong container, processor và worker giao tiếp qua `127.0.0.1` — **không** cần đổi `CHATBOT_LOCAL_FORWARD_URL` / `CHATBOT_LOCAL_PROCESS_URL` khi dùng `docker-compose.yml` (đã set sẵn).

## 2. Build image

### Cách A — Docker Compose (khuyến nghị)

```powershell
docker compose build
```

### Cách B — Docker CLI

```powershell
docker build -t singae-local:latest .
```

Build lần đầu có thể mất vài phút (biên dịch native module `sqlite3`, `bcrypt`).

## 3. Chạy container

### Compose

```powershell
docker compose up -d
docker compose logs -f
```

### CLI

```powershell
docker run -d --name singae-local `
  -p 3000:3000 `
  -p 13001:13001 `
  -v "${PWD}/private:/app/private" `
  -v "${PWD}/chatbot/database:/app/chatbot/database" `
  -e LISTEN_HOST=0.0.0.0 `
  -e CHATBOT_LOCAL_FORWARD_URL=http://127.0.0.1:13001/webhooks/chatbot/facebook `
  -e CHATBOT_LOCAL_PROCESS_URL=http://127.0.0.1:13000/process `
  singae-local:latest
```

(Linux/macOS: thay `` ` `` bằng `\` cuối dòng.)

## 4. Kiểm tra

| Endpoint | Kỳ vọng |
|----------|---------|
| http://localhost:3000 | Tool hub UI |
| http://localhost:3000/api/health | `"role":"local"`, `"ok":true` |
| http://localhost:13001/api/health | Chatbot engine OK |
| https://singae.cloud/api/health | Sau khi worker chạy: `bridgeConnected: true` |

```powershell
curl.exe -sS http://127.0.0.1:3000/api/health
curl.exe -sS http://127.0.0.1:13001/api/health
curl.exe -sS https://singae.cloud/api/health
```

Processor (`:13000`) chỉ lắng nghe `127.0.0.1` trong container — không expose ra host (đúng thiết kế).

## 5. Quản lý

```powershell
docker compose ps
docker compose stop
docker compose down
docker compose up -d --build   # rebuild sau khi đổi code
```

Xem process PM2 trong container:

```powershell
docker compose exec singae-local pm2 status
docker compose exec singae-local pm2 logs
```

## 6. Port & volume

| Port | Dịch vụ |
|------|---------|
| 3000 | Tool hub (`server.js`) |
| 13001 | Chatbot engine |
| 13000 | Processor (nội bộ container) |

Volume mặc định trong `docker-compose.yml`:

- `private/` — `.env`, OAuth JSON, credential Zalo
- `chatbot/database/` — SQLite chatbot + log
- Các thư mục `database/` / `data/` của tool khác

## 7. Lỗi thường gặp

| Triệu chứng | Xử lý |
|-------------|--------|
| Container thoát ngay | `docker compose logs` — thường thiếu `private/.env` hoặc lỗi npm native |
| `bridgeConnected: false` | Container chạy nhưng worker chưa kết nối VPS — kiểm tra `CHATBOT_MANAGER_BASE_URL`, firewall |
| Build fail ở `sqlite3` | Đảm bảo dùng image `node:20-bookworm-slim` (đã có `python3`, `make`, `g++` trong Dockerfile) |
| Port 3000 bận | Đổi mapping: `PORT=3001 docker compose up -d` và sửa `ports` trong compose nếu cần |

Chi tiết test end-to-end: [TEST.md](./TEST.md).
