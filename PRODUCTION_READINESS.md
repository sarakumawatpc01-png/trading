# Production Readiness Guide (Single VPS + Docker + Nginx Proxy Manager)

This document describes the production deployment for this repository on a single Ubuntu VPS using Docker Compose and Nginx Proxy Manager (NPM).

## Security model

Primary protection:
1. NPM Access List (Basic Auth) on the public host.

Secondary protection:
2. Backend admin API key (`x-admin-key`) enforced for all `/api/admin/*` routes.

## Required environment variables

Copy `.env.example` to `.env` and set at least:

- `ADMIN_API_KEY` (**required** when `ADMIN_API_ENFORCE=true`)
- `CORS_ALLOWED_ORIGINS` (must include your dashboard domain, e.g. `https://trading.yourdomain.com`)
- `NEXT_PUBLIC_WS_BASE` (set to public WSS endpoint if websocket updates are needed, e.g. `wss://trading.yourdomain.com`)

Important behavior:
- Backend fails fast on startup if `ADMIN_API_ENFORCE=true` and `ADMIN_API_KEY` is missing.

## Public vs private ports

VPS public ports:
- `80/443` → Nginx Proxy Manager only
- `22` → SSH

Application containers:
- `frontend` exposed only on loopback: `127.0.0.1:3000`
- `backend`, `python-service`, `redis`, `clickhouse` are internal-only on Docker network

## Nginx Proxy Manager setup

1. Create an **Access List** in NPM with Basic Auth user/password.
2. Create a **Proxy Host**:
   - Domain: `trading.<yourdomain>`
   - Forward Hostname/IP: `127.0.0.1`
   - Forward Port: `3000`
3. Attach the Access List to this Proxy Host.
4. Enable **SSL** with Let’s Encrypt and force HTTPS.
5. Enable **Websockets Support** for this host.

## Deploy / run

```bash
cd /home/runner/work/trading/trading
cp .env.example .env
# edit .env values
docker compose up -d --build
```

## Health checks

- Backend: `GET /api/health`
- Python service: `GET /health`
- Frontend: container-level HTTP health check on `/`

Compose includes healthchecks for backend, frontend, and python-service.

## Upgrade safely

1. Pull latest code.
2. Review `.env.example` for new variables and update `.env` if needed.
3. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```
4. Verify:
   - `docker compose ps` (all healthy)
   - dashboard loads through NPM
   - `/api/admin/*` calls still require valid `x-admin-key`

## Notes about admin key handling in frontend

- Admin key is injected server-side in `frontend` API proxy route (`/api/proxy/*`), not hardcoded in browser code.
- This keeps `ADMIN_API_KEY` out of browser JavaScript and relies on NPM Basic Auth as the main outer gate.
