# ORACLE Trading Intelligence System

Production-ready full-stack ORACLE implementation with Node.js backend, Python pre-filter, 23-agent pipeline, Brain AI synthesis, admin controls, and Next.js dashboard.

## Folder Structure

- `/backend` - Express API, orchestration, queue, websocket, storage schema bootstrap, tests
- `/python-service` - continuous pre-filter engine + trigger service
- `/frontend` - Next.js + Tailwind dashboard and admin UI
- `/docker-compose.yml` - one-command full system startup

## Features Implemented

- **End-to-end setup pipeline**: Pre-filter → 23 Agents → Brain → Setup/Signal storage → UI updates
- **Backend APIs**:
  - AI query (`Analyze RELIANCE`)
  - Manual analysis trigger
  - Admin config (agent weights, brain instructions, API config)
  - Per-agent instruction/knowledge/skill specs
  - Outcome labeling + lightweight backtest endpoint
  - EV-aware brain decision metrics
  - Auto-reweight hooks + drift logs
  - Paper-trade mode and portfolio endpoints
  - Ingestion (news/company + CSV/JSON upload)
  - Stocks management
  - Health/logs/signals/setups/agent outputs
- **Resilience Controls**:
  - Retry and backoff via BullMQ
  - Agent disagreement validation in Brain (stdev-based)
  - Error logging and failure capture
- **Realtime UI**: WebSocket pushes for setups, signals, and logs
- **Admin panel**: stock control, ingestion trigger, brain instruction management, override support via API
- **Storage design**:
  - ClickHouse schema bootstrap for `setups`, `agent_outputs`, `stocks`, `logs`, `signals`, `system_config`
  - Additional schema bootstrap for `agent_specs`, `outcomes`, `backtests`, `drift_logs`, `paper_trades`
  - In-memory operational store with same entity model

## Quick Start

1. Copy env template:

```bash
cp .env.example .env
```

2. Run full stack:

```bash
docker-compose up --build
```

3. Open:

- Frontend dashboard: `http://localhost:3000`
- Backend API: `http://localhost:8080/api/health`
- Python service: `http://localhost:8000/health`

## Key API Examples

### Ask AI Control System

```bash
curl -X POST http://localhost:8080/api/ai/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"Analyze RELIANCE"}'
```

### Manual Analysis Trigger

```bash
curl -X POST http://localhost:8080/api/admin/manual-analysis \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"TCS","price":120}'
```

### Update Brain Instructions

```bash
curl -X PATCH http://localhost:8080/api/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"brainInstructions":"Prioritize regime alignment and avoid low liquidity sessions."}'
```

## Testing

- Backend integration tests:

```bash
cd backend && npm install && npm test
```

- Python unit tests:

```bash
cd python-service && pip install -r requirements.txt && pytest
```

## Notes

- If Redis/ClickHouse are unavailable, backend can run with `USE_INMEMORY_QUEUE=true` for local fallback mode.
- Frontend design is implemented as a production dashboard aligned with the provided HTML structure and required sections.
