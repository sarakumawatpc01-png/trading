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
  const pythonClient = {
    health: async () => ({ status: 'up' }),
    triggerPrefilter: async (p) => ({ accepted: true, payload: p }),
    updatePrefilterConfig: async (p) => ({ updated: true, config: p })
  };

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

test('seeds baseline specs for all 23 agents and supports bulk spec updates', async () => {
  const { app } = buildApp();

  const agentsRes = await request(app).get('/api/agents');
  assert.equal(agentsRes.status, 200);
  assert.equal(agentsRes.body.length, 23);

  const seededSpecRes = await request(app).get('/api/agents/A23_MarketScanner/spec');
  assert.equal(seededSpecRes.status, 200);
  assert.ok(seededSpecRes.body.instruction.includes('Specialist A23_MarketScanner'));
  assert.ok(seededSpecRes.body.knowledge.includes('Knowledge v2'));
  assert.equal(seededSpecRes.body.skill.profileVersion, 'v2');
  assert.equal(seededSpecRes.body.skill.domain, 'market_scanner');

  const bulkRes = await request(app)
    .post('/api/agents/specs/bulk')
    .send({
      specs: {
        A1_MarketStructure: { instruction: 'Focus on structure shift', skill: { model: 'rule-v2' } },
        A2_KeyLevels: { knowledge: 'Use HTF+LTF confluence', skill: { confidenceFloor: 0.55 } }
      }
    });

  assert.equal(bulkRes.status, 200);
  assert.equal(bulkRes.body.updated, 2);
  assert.equal(bulkRes.body.specs.A1_MarketStructure.instruction, 'Focus on structure shift');
  assert.equal(bulkRes.body.specs.A1_MarketStructure.skill.model, 'rule-v2');
  assert.equal(bulkRes.body.specs.A1_MarketStructure.skill.profileVersion, 'v2');
  assert.equal(bulkRes.body.specs.A2_KeyLevels.knowledge, 'Use HTF+LTF confluence');
  assert.equal(bulkRes.body.specs.A2_KeyLevels.skill.confidenceFloor, 0.55);
});

test('records decision audit and allows fetching by symbol', async () => {
  const { app } = buildApp();

  await request(app).post('/api/admin/manual-analysis').send({ symbol: 'RELIANCE', price: 120 });
  await new Promise((r) => setTimeout(r, 30));

  const auditRes = await request(app).get('/api/admin/decision-audit/RELIANCE');
  assert.equal(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.body));
  assert.ok(auditRes.body.length >= 1);
  assert.equal(auditRes.body[0].symbol, 'RELIANCE.NS');
  assert.ok(Array.isArray(auditRes.body[0].agentVotes));
});

test('supports prefilter config updates and persists config', async () => {
  const { app } = buildApp();

  const res = await request(app).post('/api/prefilter/config').send({
    momentumModulus: 9,
    volumeModulus: 5,
    momentumWeight: 0.6,
    volumeWeight: 0.4,
    triggerThreshold: 4.5
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.prefilterConfig.momentumModulus, 9);
  assert.equal(res.body.prefilterConfig.triggerThreshold, 4.5);
});

test('triggers drawdown kill-switch and emits risk event', async () => {
  const { app } = buildApp();

  await request(app).patch('/api/admin/config').send({
    paperModeEnabled: true,
    autoShutdownDrawdownPercent: 0.01
  });
  await request(app).post('/api/admin/manual-analysis').send({ symbol: 'RELIANCE', price: 100 });
  await new Promise((r) => setTimeout(r, 30));
  const setupsRes = await request(app).get('/api/setups');
  assert.equal(setupsRes.status, 200);
  assert.ok(setupsRes.body.length >= 1);
  const openRes = await request(app).post('/api/paper/trades').send({ setupId: setupsRes.body[0].id, quantity: 1 });
  assert.equal(openRes.status, 201);
  await request(app).patch(`/api/paper/trades/${openRes.body.id}`).send({ exitPrice: 80, exitReason: 'stop' });
  await request(app).post('/api/admin/manual-analysis?paperMode=true').send({ symbol: 'RELIANCE', price: 100 });
  await new Promise((r) => setTimeout(r, 30));

  const configRes = await request(app).get('/api/admin/config');
  assert.equal(configRes.status, 200);
  assert.equal(configRes.body.paperModeEnabled, false);

  const riskRes = await request(app).get('/api/admin/risk-events');
  assert.equal(riskRes.status, 200);
  assert.ok(riskRes.body.some((x) => x.eventType === 'DRAWDOWN_KILL_SWITCH'));
});

test('applies event calendar for regime tagging and exposes causal attribution fields', async () => {
  const { app } = buildApp();
  const today = new Date().toISOString().slice(0, 10);
  const patchRes = await request(app).patch('/api/admin/config').send({
    eventCalendar: [
      { id: 'rel-event', title: 'RELIANCE Event', date: today, symbols: ['RELIANCE.NS'], impact: 'HIGH' }
    ]
  });
  assert.equal(patchRes.status, 200);

  await request(app).post('/api/admin/manual-analysis').send({ symbol: 'RELIANCE', price: 100 });
  await new Promise((r) => setTimeout(r, 40));

  const setupsRes = await request(app).get('/api/setups');
  assert.equal(setupsRes.status, 200);
  assert.ok(setupsRes.body.length >= 1);
  assert.equal(setupsRes.body[0].regime.eventDay, 'EVENT');
  assert.equal(setupsRes.body[0].regime.eventName, 'RELIANCE Event');

  const outcomeRes = await request(app)
    .post(`/api/setups/${setupsRes.body[0].id}/outcome`)
    .send({ exitPrice: 105, quantity: 1, exitReason: 'target_hit' });
  assert.equal(outcomeRes.status, 201);

  const contribRes = await request(app).get('/api/admin/agent-contribution-metrics?symbol=RELIANCE');
  assert.equal(contribRes.status, 200);
  assert.ok(contribRes.body.length > 0);
  assert.ok(Object.prototype.hasOwnProperty.call(contribRes.body[0], 'weightedExposure'));
  assert.ok(Object.prototype.hasOwnProperty.call(contribRes.body[0], 'causalZScore'));
});

test('batch-actions rollback all changes on failure', async () => {
  const { app } = buildApp();
  const beforeConfig = await request(app).get('/api/admin/config');
  assert.equal(beforeConfig.status, 200);
  const baselineMinWinRate = beforeConfig.body.minWinRate;

  const batchRes = await request(app).post('/api/admin/batch-actions').send({
    actions: [
      { type: 'patchConfig', payload: { minWinRate: 0.6 } },
      { type: 'patchAgentSpec', payload: { partial: { instruction: 'should fail without name' } } }
    ]
  });
  assert.equal(batchRes.status, 400);

  const afterConfig = await request(app).get('/api/admin/config');
  assert.equal(afterConfig.status, 200);
  assert.equal(afterConfig.body.minWinRate, baselineMinWinRate);
});
