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

function buildApp() {
  const store = new InMemoryStore();
  const broadcaster = new Broadcaster();
  const logger = new Logger(store, broadcaster);
  const agents = new AgentService(store);
  const brain = new BrainService(store);
  const queue = new InMemoryQueue(logger);
  const pipeline = new PipelineService({ store, queue, logger, agents, brain, broadcaster });
  const ingestion = new IngestionService(store, logger);
  const pythonClient = { health: async () => ({ status: 'up' }), triggerPrefilter: async (p) => ({ accepted: true, payload: p }) };

  pipeline.startWorker();

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({ store, pipeline, logger, ingestion, agents, pythonClient }));

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
  assert.equal(setups[0].symbol, 'RELIANCE');
});

test('admin can override signal', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/admin/override-signal')
    .send({ symbol: 'TCS', action: 'WAIT', reason: 'Risk event' });

  assert.equal(res.status, 201);
  assert.equal(res.body.symbol, 'TCS');
  assert.equal(res.body.action, 'WAIT');
});
