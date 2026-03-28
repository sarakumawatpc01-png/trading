import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';
import { InMemoryStore } from '../src/storage/inMemoryStore.js';
import { Logger } from '../src/services/logger.js';
import { Broadcaster } from '../src/services/broadcaster.js';
import { AgentService } from '../src/services/agents.js';
import { BrainService } from '../src/services/brain.js';
import { PipelineService } from '../src/services/pipeline.js';
import { InMemoryQueue } from '../src/queue/queue.js';
import { IngestionService } from '../src/services/ingestion.js';
import { BacktesterService } from '../src/services/backtester.js';
import { DriftMonitorService } from '../src/services/driftMonitor.js';
import { PaperTraderService } from '../src/services/paperTrader.js';

function buildApp() {
  const store = new InMemoryStore();
  const broadcaster = new Broadcaster();
  const logger = new Logger(store, broadcaster);
  const agents = new AgentService(store);
  const brain = new BrainService(store);
  const queue = new InMemoryQueue(logger);
  const backtester = new BacktesterService(store);
  const paperTrader = new PaperTraderService(store);
  const driftMonitor = new DriftMonitorService(store, agents);
  const pipeline = new PipelineService({ store, queue, logger, agents, brain, broadcaster, driftMonitor, paperTrader });
  const ingestion = new IngestionService(store, logger);
  const pythonClient = { health: async () => ({ status: 'up' }), triggerPrefilter: async (p) => ({ accepted: true, payload: p }) };

  pipeline.startWorker();

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({ store, pipeline, logger, ingestion, agents, pythonClient, backtester }));

  return { app, store };
}

test('AI query triggers analysis and creates setup', async () => {
  const { app, store } = buildApp();

  const res = await request(app).post('/api/ai/query').send({ query: 'Analyze RELIANCE' });
  assert.equal(res.status, 200);
  assert.equal(res.body.accepted, true);

  await new Promise((r) => setTimeout(r, 30));
  const setups = await store.listSetups();
  assert.ok(setups.length >= 1);
  assert.equal(setups[0].symbol, 'RELIANCE.NS');
});

test('admin can override signal', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/admin/override-signal')
    .send({ symbol: 'TCS', action: 'WAIT', reason: 'Risk event' });

  assert.equal(res.status, 201);
  assert.equal(res.body.symbol, 'TCS.NS');
  assert.equal(res.body.action, 'WAIT');
});

test('supports agent spec, outcome labeling, and paper trading flow', async () => {
  const { app, store } = buildApp();

  const specRes = await request(app)
    .patch('/api/agents/A1_MarketStructure/spec')
    .send({ instruction: 'Focus on structure breaks', knowledge: 'Price action only', skill: { model: 'rule-v1' } });
  assert.equal(specRes.status, 200);
  assert.equal(specRes.body.instruction, 'Focus on structure breaks');

  await request(app).post('/api/admin/manual-analysis?paperMode=true').send({ symbol: 'RELIANCE', price: 100 });
  await new Promise((r) => setTimeout(r, 30));
  const setups = await store.listSetups();
  assert.ok(setups.length >= 1);

  const outcomeRes = await request(app)
    .post(`/api/setups/${setups[0].id}/outcome`)
    .send({ entryPrice: 100, exitPrice: 105, quantity: 1, exitReason: 'target_hit' });
  assert.equal(outcomeRes.status, 201);
  assert.equal(outcomeRes.body.status, 'WIN');

  const portfolioRes = await request(app).get('/api/paper/portfolio');
  assert.equal(portfolioRes.status, 200);
  assert.ok(typeof portfolioRes.body.balance === 'number');
});
