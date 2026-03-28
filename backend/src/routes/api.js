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
    res.json({ ok: true, health, config });
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
    res.json(await store.listSetups(Number(req.query.limit || 50)));
  });

  router.get('/signals', async (req, res) => {
    res.json(await store.listSignals(Number(req.query.limit || 50)));
  });

  router.get('/agent-outputs', async (req, res) => {
    res.json(await store.listAgentOutputs(Number(req.query.limit || 200)));
  });

  router.get('/logs', async (req, res) => {
    res.json(await store.listLogs(Number(req.query.limit || 200)));
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
      const combinedWeight = Number(body.momentumWeight ?? 0) + Number(body.volumeWeight ?? 0);
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

  router.get('/admin/decision-audit/:symbol', async (req, res) => {
    const symbol = normalizeIndianSymbol(req.params.symbol);
    const limit = Number(req.query.limit || 50);
    res.json(await store.listDecisionAuditsBySymbol(symbol, limit));
  });

  router.get('/admin/risk-events', async (req, res) => {
    res.json(await store.listRiskEvents(Number(req.query.limit || 200)));
  });

  router.get('/outcomes', async (req, res) => {
    res.json(await store.listOutcomes(Number(req.query.limit || 200)));
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

  router.get('/admin/backtest/:id', async (req, res) => {
    const result = backtester ? await backtester.getBacktest(req.params.id) : await store.getBacktestResult(req.params.id);
    if (!result) return res.status(404).json({ error: 'Backtest not found' });
    res.json(result);
  });

  router.get('/admin/drift-logs', async (req, res) => {
    res.json(await store.listDriftLogs(Number(req.query.limit || 200)));
  });

  router.post('/admin/reweight', async (req, res, next) => {
    try {
      const body = z.object({ agentWeights: z.record(z.number()) }).parse(req.body || {});
      const config = await store.reweightAgents(body.agentWeights);
      res.json(config);
    } catch (err) { next(err); }
  });

  router.get('/paper/trades', async (req, res) => {
    res.json(await store.listPaperTrades(Number(req.query.limit || 200)));
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

  router.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message });
  });

  return router;
}
