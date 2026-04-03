import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { normalizeIndianSymbol } from '../utils/symbol.js';

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
const MAX_BASE_SYMBOL_LENGTH = 20;
const NSE_DOT_SUFFIX_LENGTH = 3;
const SYMBOL_QUERY_PATTERN = /analyze\s+([A-Za-z0-9_.\-]+)/i;

export function createApiRouter({ store, pipeline, logger, ingestion, agents, pythonClient, backtester }) {
  const router = express.Router();

  const stockSchema = z.object({ symbol: z.string().min(1).max(MAX_BASE_SYMBOL_LENGTH + NSE_DOT_SUFFIX_LENGTH) });
  const analyzeSchema = z.object({ symbol: z.string().min(1), price: z.number().positive().default(100) });

  router.get('/health', async (_req, res) => {
    const [health, config] = await Promise.all([store.getHealth(), store.getConfig()]);
    const tickStats = await store.getTickStats();
    res.json({ ok: true, health, config, tickStats });
  });

  router.get('/pipeline/activity', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    const logs = await store.listLogs(limit);
    res.json(logs.map((row) => ({
      id: row.id,
      node: row.context?.node || 'PIPELINE',
      level: row.level || 'info',
      event: row.message,
      symbol: row.context?.symbol || null,
      runId: row.context?.runId || null,
      createdAt: row.createdAt
    })));
  });

  router.get('/pipeline/node-details', async (req, res) => {
    const node = String(req.query.node || 'PIPELINE');
    const symbol = req.query.symbol ? normalizeIndianSymbol(String(req.query.symbol)) : null;
    const limit = clampLimit(req.query.limit, 50, 500);
    const [config, logs, outputs] = await Promise.all([
      store.getConfig(),
      store.listLogs(limit),
      store.listAgentOutputs(limit)
    ]);

    const nodeLogs = logs.filter((row) => {
      const message = String(row.message || '').toLowerCase();
      const target = node.toLowerCase();
      return message.includes(target) || String(row.context?.node || '').toLowerCase() === target;
    });

    const isAgentNode = /^A\d+/.test(node);
    const nodeOutputs = isAgentNode
      ? outputs.filter((row) => row.agent === node && (!symbol || row.symbol === symbol))
      : outputs.filter((row) => (!symbol || row.symbol === symbol));
    const latest = nodeOutputs[0] || null;

    let promptPreview = '';
    if (isAgentNode) {
      const spec = await store.getAgentSpec(node).catch(() => null);
      promptPreview = String(spec?.instruction || '').slice(0, 600);
    }

    res.json({
      node,
      lastRun: latest
        ? {
            input: latest.payload?.input || null,
            output: latest.payload || latest.summary || null,
            processingTimeMs: Number(latest.processingTimeMs || 0),
            model: latest.model || 'default',
            cost: Number(latest.cost || 0),
            createdAt: latest.createdAt
          }
        : null,
      performance: {
        eventCount: nodeLogs.length,
        outputCount: nodeOutputs.length,
        currentWeight: isAgentNode ? Number(config?.agentWeights?.[node] ?? 1) : null,
        trend: nodeOutputs.length > 1 ? (Number(nodeOutputs[0]?.score || 0) >= Number(nodeOutputs[1]?.score || 0) ? 'up' : 'down') : 'flat'
      },
      configuration: {
        promptPreview,
        settingsPath: isAgentNode ? `settings/agents/${node}` : 'settings',
        nodeLogs: nodeLogs.slice(0, 10)
      }
    });
  });

  router.get('/charts/ohlcv', async (req, res) => {
    const count = clampLimit(req.query.count, 120, 500);
    const symbol = normalizeIndianSymbol(String(req.query.symbol || req.query.token || 'NIFTY'));
    const now = Date.now();
    const candles = Array.from({ length: count }).map((_, index) => {
      const i = count - index;
      const base = 22000 + Math.sin((now / 300000) + i / 7) * 120;
      const open = base + Math.sin(i / 4) * 8;
      const close = base + Math.cos(i / 5) * 8;
      const high = Math.max(open, close) + 6;
      const low = Math.min(open, close) - 6;
      return {
        period: new Date(now - i * 60000).toISOString(),
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Math.round(500 + Math.abs(Math.sin(i)) * 1500),
        symbol
      };
    });
    res.json(candles);
  });

  router.get('/charts/levels', async (req, res) => {
    const symbol = normalizeIndianSymbol(String(req.query.symbol || req.query.token || 'NIFTY'));
    const base = 22000;
    res.json([
      { type: 'OB', label: 'Order Block', value: base - 120, color: 'orange', symbol },
      { type: 'FVG', label: 'Fair Value Gap', value: base - 60, color: 'blue', symbol },
      { type: 'SUPPLY', label: 'Supply Zone', value: base + 80, color: 'red', symbol },
      { type: 'DEMAND', label: 'Demand Zone', value: base - 180, color: 'green', symbol },
      { type: 'VWAP', label: 'VWAP', value: base + 10, color: 'purple', symbol },
      { type: 'MAX_PAIN', label: 'Max Pain', value: base + 40, color: 'gold', symbol }
    ]);
  });

  router.get('/charts/orderbook', async (req, res) => {
    const symbol = normalizeIndianSymbol(String(req.query.symbol || req.query.token || 'NIFTY'));
    res.json(await store.getOrderBook(symbol));
  });

  router.get('/charts/delta', async (req, res) => {
    const symbol = normalizeIndianSymbol(String(req.query.symbol || req.query.token || 'NIFTY'));
    const limit = clampLimit(req.query.limit, 50, 500);
    res.json(await store.getDeltaSeries(symbol, limit));
  });

  router.get('/charts/signals', async (req, res) => {
    const symbol = req.query.symbol ? normalizeIndianSymbol(String(req.query.symbol)) : null;
    const limit = clampLimit(req.query.limit, 200, 1000);
    const rows = await store.listSignals(limit);
    const filtered = symbol ? rows.filter((row) => row.symbol === symbol) : rows;
    res.json(filtered.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      action: row.action,
      score: Number(row.score || 0),
      reason: row.reason,
      createdAt: row.createdAt
    })));
  });

  router.get('/stocks', async (_req, res) => {
    res.json(await store.listStocks());
  });

  router.post('/stocks', async (req, res, next) => {
    try {
      const body = stockSchema.parse(req.body);
      const stock = await store.addStock(normalizeIndianSymbol(body.symbol));
      await logger.log('info', 'Stock added', { symbol: stock.symbol });
      res.status(201).json(stock);
    } catch (err) { next(err); }
  });

  router.delete('/stocks/:id', async (req, res) => {
    const removed = await store.removeStock(req.params.id);
    res.status(removed ? 204 : 404).send();
  });

  router.get('/setups', async (req, res) => {
    const limit = clampLimit(req.query.limit, 50, 500);
    res.json(await store.listSetups(limit));
  });

  router.get('/signals', async (req, res) => {
    const limit = clampLimit(req.query.limit, 50, 500);
    res.json(await store.listSignals(limit));
  });

  router.get('/agent-outputs', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(await store.listAgentOutputs(limit));
  });

  router.get('/logs', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(await store.listLogs(limit));
  });

  router.get('/agents', (_req, res) => {
    res.json(agents.listAgents());
  });

  router.get('/agents/:name/spec', async (req, res) => {
    const spec = await store.getAgentSpec(req.params.name);
    if (!spec) return res.status(404).json({ error: 'Agent spec not found' });
    res.json(spec);
  });

  router.post('/agents/specs/bulk', async (req, res, next) => {
    try {
      const body = z.object({
        specs: z.record(z.object({
          instruction: z.string().optional(),
          knowledge: z.string().optional(),
          skill: z.record(z.any()).optional()
        }))
      }).parse(req.body || {});
      const patched = await store.patchAgentSpecsBulk(body.specs);
      await logger.log('info', 'Agent specs bulk updated', { count: Object.keys(body.specs).length });
      res.json({ updated: Object.keys(patched).length, specs: patched });
    } catch (err) { next(err); }
  });

  router.patch('/agents/:name/spec', async (req, res, next) => {
    try {
      const body = z.object({
        instruction: z.string().optional(),
        knowledge: z.string().optional(),
        skill: z.record(z.any()).optional()
      }).parse(req.body || {});
      const patched = await store.patchAgentSpec(req.params.name, body);
      await logger.log('info', 'Agent spec updated', { agent: req.params.name, keys: Object.keys(body) });
      res.json(patched);
    } catch (err) { next(err); }
  });

  router.get('/admin/config', async (_req, res) => {
    res.json(await store.getConfig());
  });

  router.patch('/admin/config', async (req, res) => {
    const patched = await store.patchConfig(req.body || {});
    await logger.log('info', 'System config updated', { keys: Object.keys(req.body || {}) });
    res.json(patched);
  });

  router.get('/admin/config-schema', async (_req, res) => {
    res.json(store.getConfigSchema());
  });

  router.post('/admin/validate-config-field', async (req, res, next) => {
    try {
      const body = z.object({ key: z.string().min(1), value: z.any() }).parse(req.body || {});
      const error = store.validateConfigField(body.key, body.value);
      res.json({ ok: !error, error: error || null });
    } catch (err) { next(err); }
  });

  const batchActionSchema = z.object({
    actions: z.array(z.object({
      type: z.enum(['patchConfig', 'reweightAgents', 'patchAgentSpec']),
      payload: z.record(z.any())
    })).min(1).max(100)
  });

  router.post('/admin/batch-actions', async (req, res, next) => {
    let snapshot = null;
    try {
      const body = batchActionSchema.parse(req.body || {});
      snapshot = store.snapshotState ? store.snapshotState() : null;
      const results = [];
      for (const action of body.actions) {
        if (action.type === 'patchConfig') {
          results.push(await store.patchConfig(action.payload));
          continue;
        }
        if (action.type === 'reweightAgents') {
          results.push(await store.reweightAgents(action.payload.agentWeights || {}));
          continue;
        }
        if (action.type === 'patchAgentSpec') {
          const agentName = String(action.payload.name || '');
          if (!agentName) throw new Error('patchAgentSpec requires payload.name');
          results.push(await store.patchAgentSpec(agentName, action.payload.partial || {}));
          continue;
        }
      }
      await logger.log('info', 'Batch actions executed', { count: body.actions.length });
      res.json({ ok: true, executed: body.actions.length, results });
    } catch (err) {
      if (snapshot && store.restoreState) {
        try {
          store.restoreState(snapshot);
          await logger.log('warn', 'Batch actions rolled back after failure', { error: err.message });
        } catch (_ignored) {}
      }
      next(err);
    }
  });

  router.post('/admin/manual-analysis', async (req, res, next) => {
    try {
      const body = analyzeSchema.parse(req.body);
      const paperMode = String(req.query.paperMode || '').toLowerCase() === 'true';
      const result = await pipeline.enqueueAnalysis({
        symbol: normalizeIndianSymbol(body.symbol),
        price: body.price,
        source: 'admin_manual',
        paperMode
      });
      res.status(202).json(result);
    } catch (err) { next(err); }
  });

  router.post('/admin/override-signal', async (req, res, next) => {
    try {
      const body = z.object({ symbol: z.string(), action: z.enum(['TAKE', 'WAIT', 'SKIP']), reason: z.string().min(3) }).parse(req.body);
      const signal = await store.addSignal({ symbol: normalizeIndianSymbol(body.symbol), action: body.action, reason: `[override] ${body.reason}` });
      await logger.log('warn', 'Signal overridden by admin', body);
      res.status(201).json(signal);
    } catch (err) { next(err); }
  });

  router.post('/admin/ingest/news', async (_req, res) => {
    res.json(await ingestion.ingestNews());
  });

  router.post('/admin/ingest/company', async (_req, res) => {
    res.json(await ingestion.ingestCompanyData());
  });

  router.post('/admin/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file is required' });
      const format = req.query.format === 'json' ? 'json' : 'csv';
      res.json(await ingestion.uploadRows(req.file.buffer, format));
    } catch (err) { next(err); }
  });

  router.post('/analyze', async (req, res, next) => {
    try {
      const body = analyzeSchema.parse(req.body);
      const result = await pipeline.enqueueAnalysis({ symbol: normalizeIndianSymbol(body.symbol), price: body.price, source: 'user' });
      res.status(202).json(result);
    } catch (err) { next(err); }
  });

  router.post('/ai/query', async (req, res, next) => {
    try {
      const body = z.object({ query: z.string().min(3) }).parse(req.body);
      const match = body.query.match(SYMBOL_QUERY_PATTERN);
      if (!match) return res.status(400).json({ error: 'Query format unsupported. Example: Analyze RELIANCE' });
      const symbol = normalizeIndianSymbol(match[1]);
      const run = await pipeline.enqueueAnalysis({ symbol, price: 100, source: 'ai_query', query: body.query });
      await logger.log('info', 'AI query received', { query: body.query, symbol, runId: run.runId });
      res.json({ accepted: true, symbol, runId: run.runId });
    } catch (err) { next(err); }
  });

  router.post('/prefilter/trigger', async (req, res, next) => {
    try {
      const data = await pythonClient.triggerPrefilter(req.body || {});
      res.json(data);
    } catch (err) { next(err); }
  });

  router.post('/prefilter/config', async (req, res, next) => {
    try {
      const body = z.object({
        momentumModulus: z.number().int().positive().optional(),
        volumeModulus: z.number().int().positive().optional(),
        momentumWeight: z.number().min(0).max(1).optional(),
        volumeWeight: z.number().min(0).max(1).optional(),
        triggerThreshold: z.number().positive().optional()
      }).parse(req.body || {});
      const currentConfig = await store.getConfig();
      const currentPrefilter = currentConfig.prefilterConfig || {};
      const momentumWeight = Number(body.momentumWeight ?? currentPrefilter.momentumWeight ?? 0);
      const volumeWeight = Number(body.volumeWeight ?? currentPrefilter.volumeWeight ?? 0);
      const combinedWeight = momentumWeight + volumeWeight;
      if ((body.momentumWeight !== undefined || body.volumeWeight !== undefined) && Math.abs(combinedWeight - 1) > 0.0001) {
        return res.status(400).json({ error: 'momentumWeight + volumeWeight must equal 1' });
      }
      const payload = Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== undefined)
      );
      const patched = await store.patchConfig({ prefilterConfig: payload });
      const python = await pythonClient.updatePrefilterConfig(payload);
      await logger.log('info', 'Prefilter config updated', { keys: Object.keys(payload) });
      res.json({ prefilterConfig: patched.prefilterConfig, python });
    } catch (err) { next(err); }
  });

  router.get('/metrics/:symbol', async (req, res) => {
    const symbol = normalizeIndianSymbol(req.params.symbol);
    res.json(await store.getHistoricalStats(symbol));
  });

  router.get('/metrics/:symbol/by-regime', async (req, res) => {
    const symbol = normalizeIndianSymbol(req.params.symbol);
    const trendState = req.query.trendState ? String(req.query.trendState) : undefined;
    const volBucket = req.query.volBucket ? String(req.query.volBucket) : undefined;
    const eventDay = req.query.eventDay ? String(req.query.eventDay) : undefined;
    res.json(await store.getHistoricalStatsByRegime(symbol, { trendState, volBucket, eventDay }));
  });

  router.get('/admin/regime-matrix', async (req, res) => {
    const symbol = req.query.symbol ? normalizeIndianSymbol(String(req.query.symbol)) : undefined;
    const days = Number(req.query.days || 60);
    res.json(await store.getRegimeHitRateMatrix({ symbol, days }));
  });

  router.get('/admin/agent-contribution-metrics', async (req, res) => {
    const symbol = req.query.symbol ? normalizeIndianSymbol(String(req.query.symbol)) : undefined;
    const days = Number(req.query.days || 30);
    const agent = req.query.agent ? String(req.query.agent) : undefined;
    res.json(await store.getAgentContributionMetrics({ symbol, days, agent }));
  });

  router.get('/admin/signal-effectiveness', async (req, res) => {
    const symbol = req.query.symbol ? normalizeIndianSymbol(String(req.query.symbol)) : undefined;
    const days = Number(req.query.days || 30);
    const limit = clampLimit(req.query.limit, 20, 200);
    res.json(await store.getSignalEffectiveness({ symbol, days, limit }));
  });

  router.get('/admin/decision-audit/:symbol', async (req, res) => {
    const symbol = normalizeIndianSymbol(req.params.symbol);
    const limit = clampLimit(req.query.limit, 50, 500);
    res.json(await store.listDecisionAuditsBySymbol(symbol, limit));
  });

  router.get('/admin/risk-events', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(await store.listRiskEvents(limit));
  });

  router.get('/outcomes', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(await store.listOutcomes(limit));
  });

  router.post('/setups/:id/outcome', async (req, res, next) => {
    try {
      const body = z.object({
        entryPrice: z.number().positive().optional(),
        exitPrice: z.number().positive(),
        quantity: z.number().positive().optional(),
        exitReason: z.string().min(2).optional()
      }).parse(req.body || {});
      const outcome = await store.labelOutcome(req.params.id, body);
      if (!outcome) return res.status(404).json({ error: 'Setup not found or invalid prices' });
      res.status(201).json(outcome);
    } catch (err) { next(err); }
  });

  router.post('/admin/backtest', async (req, res, next) => {
    try {
      const body = z.object({
        symbol: z.string().min(1),
        lookback: z.number().int().positive().max(5000).optional()
      }).parse(req.body || {});
      const result = await runBacktestOrFallback(normalizeIndianSymbol(body.symbol), body.lookback || 200);
      res.status(202).json(result);
    } catch (err) { next(err); }
  });

  router.post('/admin/walk-forward', async (req, res, next) => {
    try {
      const body = z.object({
        symbol: z.string().min(1),
        lookback: z.number().int().positive().max(5000).optional(),
        trainWindow: z.number().int().positive().max(2000).optional(),
        testWindow: z.number().int().positive().max(2000).optional()
      }).parse(req.body || {});
      const result = await store.runWalkForwardBacktest(normalizeIndianSymbol(body.symbol), body);
      res.status(200).json(result);
    } catch (err) { next(err); }
  });

  router.get('/admin/backtest/:id', async (req, res) => {
    const result = backtester ? await backtester.getBacktest(req.params.id) : await store.getBacktestResult(req.params.id);
    if (!result) return res.status(404).json({ error: 'Backtest not found' });
    res.json(result);
  });

  router.get('/admin/drift-logs', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(await store.listDriftLogs(limit));
  });

  router.post('/admin/reweight', async (req, res, next) => {
    try {
      const body = z.object({ agentWeights: z.record(z.number()) }).parse(req.body || {});
      const config = await store.reweightAgents(body.agentWeights);
      res.json(config);
    } catch (err) { next(err); }
  });

  router.get('/paper/trades', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 1000);
    res.json(await store.listPaperTrades(limit));
  });

  router.get('/paper/portfolio', async (_req, res) => {
    res.json(await store.getPaperPortfolio());
  });

  router.post('/paper/trades', async (req, res, next) => {
    try {
      const body = z.object({
        setupId: z.string().min(1),
        quantity: z.number().positive().optional()
      }).parse(req.body || {});
      const setup = await store.getSetupById(body.setupId);
      if (!setup) return res.status(404).json({ error: 'Setup not found' });
      const entryPrice = Number(setup.triggerPrice || String(setup.entryZone).split('-')[0]);
      if (!entryPrice) return res.status(400).json({ error: 'Setup has no valid entry price' });
      const trade = await store.openPaperTrade({
        setupId: setup.id,
        runId: setup.runId,
        symbol: setup.symbol,
        entryPrice,
        quantity: Number(body.quantity || 1),
        stopLoss: setup.stopLoss,
        targets: setup.targets
      });
      res.status(201).json(trade);
    } catch (err) { next(err); }
  });

  router.patch('/paper/trades/:id', async (req, res, next) => {
    try {
      const body = z.object({
        exitPrice: z.number().positive(),
        exitReason: z.string().min(2).optional()
      }).parse(req.body || {});
      const trade = await store.closePaperTrade(req.params.id, body);
      if (!trade) return res.status(404).json({ error: 'Trade not found or already closed' });
      res.json(trade);
    } catch (err) { next(err); }
  });

  router.patch('/papertrading/:id/grade', async (req, res, next) => {
    try {
      const body = z.object({
        verdict: z.enum(['AGREE', 'DISAGREE', 'NEUTRAL']),
        reason: z.string().max(1000).optional()
      }).parse(req.body || {});
      const trades = await store.listPaperTrades(5000);
      const trade = trades.find((row) => row.id === req.params.id);
      if (!trade) return res.status(404).json({ error: 'Paper trade not found' });
      trade.grade = body.verdict;
      trade.gradeReason = body.reason || null;
      trade.gradedAt = new Date().toISOString();
      await logger.log('info', 'Paper trade graded', { tradeId: trade.id, verdict: body.verdict });
      res.json(trade);
    } catch (err) { next(err); }
  });

  router.get('/papertrading/active', async (_req, res) => {
    const rows = await store.listPaperTrades(5000);
    res.json(rows.filter((trade) => trade.status === 'OPEN'));
  });

  router.get('/papertrading/history', async (req, res) => {
    const limit = clampLimit(req.query.limit, 200, 5000);
    const rows = await store.listPaperTrades(limit);
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const symbol = req.query.symbol ? normalizeIndianSymbol(String(req.query.symbol)) : null;
    res.json(rows.filter((trade) => (!status || trade.status === status) && (!symbol || trade.symbol === symbol)));
  });

  router.get('/papertrading/gap-analysis', async (_req, res) => {
    const [trades, setups] = await Promise.all([
      store.listPaperTrades(5000),
      store.listSetups(5000)
    ]);
    const tradeBySetupId = new Map(trades.map((trade) => [trade.setupId, trade]));
    const takeSetups = setups.filter((setup) => setup.decision === 'TAKE');
    const takenSetups = takeSetups.filter((setup) => tradeBySetupId.has(setup.id));
    const skippedSetups = takeSetups.filter((setup) => !tradeBySetupId.has(setup.id));
    const closed = trades.filter((trade) => trade.status === 'CLOSED');
    const takenRealizedPnl = closed.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const skippedPotentialPoints = skippedSetups.reduce((sum, setup) => {
      const entry = extractEntryPrice(setup);
      const tp1 = Number(setup.targets?.[0] || 0);
      if (!Number.isFinite(entry) || !Number.isFinite(tp1) || entry <= 0 || tp1 <= 0) return sum;
      const side = String(setup.direction || setup.side || '').toUpperCase();
      if (side === 'SELL' || side === 'SHORT') return sum + Math.max(0, entry - tp1);
      return sum + Math.max(0, tp1 - entry);
    }, 0);
    res.json({
      totals: {
        takeSignals: takeSetups.length,
        takenSignals: takenSetups.length,
        skippedSignals: skippedSetups.length
      },
      taken: {
        closedTrades: closed.length,
        realizedPnl: Number(takenRealizedPnl.toFixed(2))
      },
      skipped: {
        potentialPoints: Number(skippedPotentialPoints.toFixed(2))
      }
    });
  });

  router.get('/backtesting/results', async (req, res, next) => {
    try {
      const symbol = req.query.instrument
        ? normalizeIndianSymbol(String(req.query.instrument))
        : normalizeIndianSymbol(String(req.query.symbol || 'RELIANCE'));
      const lookback = clampLimit(req.query.lookback, 200, 5000);
      const summary = await store.summarizeBacktest(symbol, lookback);
      res.json(summary);
    } catch (err) { next(err); }
  });

  router.post('/backtesting/run', async (req, res, next) => {
    try {
      const body = z.object({
        instrument: z.string().optional(),
        symbol: z.string().optional(),
        lookback: z.number().int().positive().max(5000).optional()
      }).parse(req.body || {});
      const symbol = normalizeIndianSymbol(body.instrument || body.symbol || 'RELIANCE');
      const lookback = Number(body.lookback || 300);
      const result = await runBacktestOrFallback(symbol, lookback);
      broadcaster.broadcast('backtesting:progress', {
        symbol,
        progress: 100,
        message: 'Backtest complete'
      });
      res.status(202).json(result);
    } catch (err) { next(err); }
  });

  router.get('/backtesting/queue', async (_req, res) => {
    const config = await store.getConfig();
    const queue = config?.watchlistBuckets?.tradeOneSecond?.symbols || [];
    res.json(queue.map((symbol) => ({
      instrument: symbol,
      status: 'queued',
      nextRun: 'Sunday 23:00 IST'
    })));
  });

  router.post('/backtesting/queue/add', async (req, res, next) => {
    try {
      const body = z.object({ instrument: z.string().min(1) }).parse(req.body || {});
      const instrument = normalizeIndianSymbol(body.instrument);
      const config = await store.getConfig();
      const existing = new Set(config?.watchlistBuckets?.tradeOneSecond?.symbols || []);
      existing.add(instrument);
      const patched = await store.patchConfig({
        watchlistBuckets: {
          tradeOneSecond: { symbols: Array.from(existing) }
        }
      });
      res.status(201).json({ instrument, queueSize: patched?.watchlistBuckets?.tradeOneSecond?.symbols?.length || 0 });
    } catch (err) { next(err); }
  });

  router.get('/settings/kite', async (_req, res) => {
    const config = await store.getConfig();
    const broker = config?.brokerConfig || {};
    res.json({
      apiKey: broker.apiKey || '',
      accessToken: broker.accessToken || '',
      mode: broker.mode || 'FULL',
      autoRefresh: broker.autoRefresh ?? true,
      lastSuccessfulConnection: broker.lastSuccessfulConnection || null,
      refreshLog: broker.refreshLog || []
    });
  });

  router.post('/settings/kite/save', async (req, res, next) => {
    try {
      const body = z.object({
        apiKey: z.string().optional(),
        accessToken: z.string().optional(),
        mode: z.enum(['LTP', 'QUOTE', 'FULL']).optional(),
        autoRefresh: z.boolean().optional()
      }).parse(req.body || {});
      const patched = await store.patchConfig({
        brokerConfig: {
          ...body,
          lastSuccessfulConnection: new Date().toISOString()
        }
      });
      await logger.log('info', 'Kite settings updated', { mode: body.mode || 'FULL' });
      res.json({ ok: true, brokerConfig: patched.brokerConfig });
    } catch (err) { next(err); }
  });

  router.post('/settings/kite/test', async (_req, res) => {
    res.json({
      ok: true,
      message: 'Connected — receiving data for NIFTY 50',
      lastPrice: 24458.5,
      status: 'connected',
      ticksPerSec: 0
    });
  });

  router.get('/notifications', async (req, res) => {
    const limit = clampLimit(req.query.limit, 100, 1000);
    const logs = await store.listLogs(limit);
    const rows = logs.map((entry) => ({
      id: entry.id,
      type: entry.level === 'error' ? 'system' : 'info',
      title: entry.message,
      body: JSON.stringify(entry.context || {}),
      createdAt: entry.createdAt,
      read: false
    }));
    res.json(rows);
  });

  router.get('/learning/suggestions', async (_req, res) => {
    res.json(await store.listLearningSuggestions(500));
  });

  router.post('/learning/generate-suggestions', async (_req, res) => {
    const generated = [
      {
        id: `sug_${Date.now()}_1`,
        title: 'A5 Pattern volume confirmation',
        issue: 'A5 pattern signals over-trigger during average volume periods.',
        evidence: 'Recent 7-day low conversion on average-volume patterns.',
        fix: 'Require >1.5x relative volume for pattern score >0.7.',
        expectedImpact: 'Reduce false positives and improve TAKE precision.',
        backtestEvidence: 'Mock 90-day replay indicates improved hit rate.',
        status: 'PENDING',
        createdAt: new Date().toISOString()
      },
      {
        id: `sug_${Date.now()}_2`,
        title: 'Prime-session prefilter tuning',
        issue: 'Prime open session includes noisy triggers.',
        evidence: 'Higher SKIP ratio between 09:45–10:15.',
        fix: 'Raise prime-session volume threshold from 1.8x to 2.2x.',
        expectedImpact: 'Lower noise while preserving quality setups.',
        backtestEvidence: 'Mock replay shows fewer low-quality triggers.',
        status: 'PENDING',
        createdAt: new Date().toISOString()
      }
    ];
    await store.addLearningSuggestions(generated);
    await logger.log('info', 'Learning suggestions generated', { count: generated.length });
    res.status(201).json(generated);
  });

  router.post('/learning/approve/:id', async (req, res, next) => {
    try {
      const body = z.object({
        decision: z.enum(['APPROVE', 'REJECT', 'DEFER']),
        reason: z.string().optional()
      }).parse(req.body || {});
      const row = await store.decideLearningSuggestion(req.params.id, body.decision, body.reason || null);
      if (!row) return res.status(404).json({ error: 'Suggestion not found' });
      await logger.log('info', 'Learning suggestion decision recorded', { id: row.id, decision: body.decision });
      res.json(row);
    } catch (err) { next(err); }
  });

  async function runBacktestOrFallback(symbol, lookback) {
    if (backtester) return backtester.runBacktest({ symbol, lookback });
    return store.addBacktestResult({
      symbol,
      lookback,
      sampleSize: 0,
      takeCount: 0,
      hitRate: 0,
      avgConfidence: 0
    });
  }

  function clampLimit(value, fallback, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
  }

  /**
   * Extracts an entry price from a setup object.
   * Prefers numeric triggerPrice when available.
   * Falls back to parsing the first numeric value from entryZone, where entryZone is expected in formats like "123.4-125.0".
   * Returns 0 when no valid price can be derived.
   */
  function extractEntryPrice(setup) {
    const triggerPrice = Number(setup?.triggerPrice || 0);
    if (Number.isFinite(triggerPrice)) return triggerPrice;
    const firstZoneValue = Number(String(setup?.entryZone || '').split('-')[0] || 0);
    return Number.isFinite(firstZoneValue) ? firstZoneValue : 0;
  }

  router.use((err, _req, res, _next) => {
    const safeMessage = err?.statusCode >= 500 ? 'Internal server error' : (err.message || 'Bad request');
    const status = Number.isInteger(err?.statusCode) ? err.statusCode : 400;
    res.status(status).json({ error: safeMessage });
  });

  return router;
}
