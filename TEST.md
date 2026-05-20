# Build & test local → VPS (singae.cloud)

VPS đã chạy trên **https://singae.cloud**. Máy dev chỉ cần folder `local/` — Simly token, webhook Facebook và hàng đợi SSE nằm trên VPS; LLM và tool UI chạy local.

```
Meta / Simly clients
        │
        ▼
  singae.cloud (vps/)
   • /api/public/tokens
   • /webhooks/chatbot/facebook
   • /api/chatbot-manager/events/stream  ◄── SSE
        │
        │  LAN / Internet
        ▼
  máy dev (local/)
   • :3000  tool hub + UI
   • :13001 chatbot engine (OpenAI)
   • :13000 processor
   • worker → kéo event từ VPS, xử lý, gửi reply qua bridge
```

## 0. Yêu cầu

- Node.js 18+ (khuyến nghị 20 LTS)
- Git clone repo, làm việc trong `local/`
- Máy dev **có internet** tới `https://singae.cloud`
- `OPENAI_API_KEY` trong `local/private/.env` (nếu test trả lời chatbot)

## 1. Kiểm tra VPS (trước khi chạy local)

Chạy trên PowerShell (máy dev):

```powershell
curl.exe -sS https://singae.cloud/api/health
curl.exe -sS https://singae.cloud/api/admin/status
```

| Kết quả | Ý nghĩa |
|---------|---------|
| `"role":"vps-thin"` | VPS mới đang chạy |
| `hasToken25VNP: true` | Simly token OK trên server |
| `bridgeConnected: false` | Bình thường khi chưa mở worker local |
| `bridgeConnected: true` | Worker local đã kết nối SSE |

Nếu token null: SSH vào VPS, kiểm tra `vps/private/.env` (không phải `config/vps/.env` trên laptop), gọi refresh:

```powershell
curl.exe -sS -X POST https://singae.cloud/api/admin/refresh
```

Webhook Facebook (Meta trỏ URL này — chỉ test tay nếu cần):

```powershell
'{"object":"page","entry":[]}' | Out-File -Encoding utf8 body.json
curl.exe -sS -X POST https://singae.cloud/webhooks/chatbot/facebook -H "Content-Type: application/json" --data-binary "@body.json"
```

Kỳ vọng: `EVENT_RECEIVED`

## 2. Cấu hình `local/private/.env`

```powershell
cd D:\GIT\SW\local
copy private\.env.example private\.env
notepad private\.env
```

**Bắt buộc trỏ VPS production** (mặc định trong `.env.example` đã đúng):

```env
SIMLY_PUBLIC_BASE_URL=https://singae.cloud
SIMLY_PUBLIC_TOKENS_URL=https://singae.cloud/api/public/tokens

CHATBOT_MANAGER_BASE_URL=https://singae.cloud/api/chatbot-manager
CHATBOT_LOCAL_FORWARD_URL=http://127.0.0.1:13001/webhooks/chatbot/facebook

USE_VPS_FB_BRIDGE=1
BRIDGE_SEND_URL=https://singae.cloud/api/chatbot-bridge/facebook/send

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Nếu VPS bật `BRIDGE_SHARED_SECRET`, thêm cùng giá trị ở local:

```env
BRIDGE_SHARED_SECRET=your-secret
```

Local **không** cần `SIMLY_API_KEY_*` — token refresh chỉ trên VPS.

## 3. Build local

```powershell
cd D:\GIT\SW\local
npm install
npm run setup
```

`npm run setup` cài dependency con (it-support, …). Nếu thiếu `morgan`:

```powershell
cd tools\it-support
npm install
cd ..\..
```

## 4. Chạy local

### Cách A — PM2 (một lệnh, khuyến nghị)

```powershell
cd D:\GIT\SW\local
npm install -g pm2
npm run pm2:start
pm2 status
```

UI: http://localhost:3000

### Cách B — 4 terminal

### Terminal 1 — Tool hub (port 3000)

```powershell
cd D:\GIT\SW\local
npm start
```

- UI: http://localhost:3000  
- Health:

```powershell
curl.exe -sS http://127.0.0.1:3000/api/health
```

Kỳ vọng: `"role":"local"`, `simlyPublicBase` / `chatbotManagerBase` trỏ `singae.cloud`.

### Terminal 2 — Chatbot engine (13001)

```powershell
cd D:\GIT\SW\local
npm run chatbot-local:server
```

```powershell
curl.exe -sS http://127.0.0.1:13001/api/health
```

### Terminal 3 — Processor (13000)

```powershell
cd D:\GIT\SW\local
npm run chatbot-local:processor
```

```powershell
curl.exe -sS http://127.0.0.1:13000/health
```

### Terminal 4 — Worker (SSE → VPS)

```powershell
cd D:\GIT\SW\local
npm run chatbot-local:worker
```

Log kỳ vọng:

```text
[chatbot-local-worker] SSE https://singae.cloud/api/chatbot-manager/events/stream
```

Sau vài giây, kiểm tra lại VPS:

```powershell
curl.exe -sS https://singae.cloud/api/health
```

`bridgeConnected` phải là **`true`**.

## 5. Test luồng end-to-end

### 5.1 Simly từ local UI

Mở tool dùng appointment/token (commission, lookup, …). Data token lấy từ:

`GET https://singae.cloud/api/public/tokens`

Local chỉ proxy qua `SIMLY_PUBLIC_BASE_URL` — không refresh token.

### 5.2 Facebook (production webhook)

1. Meta Developer → Webhook URL: `https://singae.cloud/webhooks/chatbot/facebook`
2. Máy dev: 4 terminal như trên đang chạy
3. Nhắn tin vào Page → VPS nhận webhook → enqueue → worker local xử lý → reply qua `BRIDGE_SEND_URL`

Theo dõi log terminal worker / processor / engine.

### 5.3 Webhook thử tay (không cần Meta)

```powershell
curl.exe -sS -X POST https://singae.cloud/webhooks/chatbot/facebook -H "Content-Type: application/json" --data-binary "@body.json"
```

Nếu payload có `entry` hợp lệ, worker sẽ log `answered <eventId>` hoặc lỗi xử lý.

## 6. Checklist ổn định

| # | Kiểm tra | Pass |
|---|----------|------|
| 1 | `https://singae.cloud/api/health` | `ok: true`, `role: vps-thin` |
| 2 | `/api/admin/status` | `hasToken25VNP: true` |
| 3 | Local `:3000/api/health` | `role: local` |
| 4 | Engine `:13001/api/health` | OK |
| 5 | Processor `:13000/health` | OK |
| 6 | Worker SSE | không reconnect loop |
| 7 | VPS health sau worker | `bridgeConnected: true` |
| 8 | Tin nhắn FB thật | bot trả lời (cần `OPENAI_API_KEY`) |

## 7. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|-------------|-------------|--------|
| `bridgeConnected: false` | Worker chưa chạy hoặc sai URL | Bật terminal 4; kiểm tra `CHATBOT_MANAGER_BASE_URL` |
| Worker reconnect liên tục | Firewall hoặc VPS thiếu route `/api/chatbot-manager/*` | Redeploy `vps/` mới; tạm: VPS local `:3001` + `CHATBOT_MANAGER_BASE_URL=http://127.0.0.1:3001/api/chatbot-manager` |
| Simly token null trên VPS | Thiếu key trên server | `vps/private/.env` + `POST /api/admin/refresh` |
| Local tool không load token | Sai `SIMLY_PUBLIC_BASE_URL` | Phải `https://singae.cloud` |
| FB không trả lời | Thiếu OpenAI hoặc bridge | `OPENAI_API_KEY`; `USE_VPS_FB_BRIDGE=1`; `FB_PAGE_ACCESS_TOKEN` trên VPS |
| 401 bridge send | Secret lệch | Cùng `BRIDGE_SHARED_SECRET` local + VPS |
| `EADDRINUSE :3000` | Port bận | `netstat -ano \| findstr :3000` → `taskkill /PID <pid> /F` |
| Chatbot không mount | Thiếu module | `npm install` trong `local/` |
| `Cannot find module '../../tools/chatbot/server/channelConfig'` | Import cũ sau khi tách `local/chatbot` | Pull code mới (`../../chatbot/server/...`) |
| `EventSource is not a constructor` | Sai cách import package `eventsource` | `const EventSource = require("eventsource")` |

## 8. Dừng test

```powershell
netstat -ano | findstr ":3000 :13000 :13001"
taskkill /PID <pid> /F
```

Chỉ tắt worker → VPS lại báo `bridgeConnected: false` (VPS vẫn nhận webhook, event chờ trong queue).

---

## Phụ lục: test VPS trên máy (không bắt buộc)

Chỉ khi muốn debug không dùng production:

```powershell
cd D:\GIT\SW\vps
$env:PORT = "3001"
node server.js
```

Trong `local/private/.env` tạm đổi:

```env
SIMLY_PUBLIC_BASE_URL=http://127.0.0.1:3001
CHATBOT_MANAGER_BASE_URL=http://127.0.0.1:3001/api/chatbot-manager
BRIDGE_SEND_URL=http://127.0.0.1:3001/api/chatbot-bridge/facebook/send
```

Nhớ đổi lại `https://singae.cloud` trước khi test với Meta thật.
