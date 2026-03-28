import express from 'express';
import multer from 'multer';
import { z } from 'zod';

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

export function createApiRouter({ store, pipeline, logger, ingestion, agents, pythonClient }) {
  const router = express.Router();

  const stockSchema = z.object({ symbol: z.string().min(1).max(20) });
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
      const stock = await store.addStock(body.symbol.toUpperCase());
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
      const result = await pipeline.enqueueAnalysis({ symbol: body.symbol.toUpperCase(), price: body.price, source: 'admin_manual' });
      res.status(202).json(result);
    } catch (err) { next(err); }
  });

  router.post('/admin/override-signal', async (req, res, next) => {
    try {
      const body = z.object({ symbol: z.string(), action: z.enum(['TAKE', 'WAIT', 'SKIP']), reason: z.string().min(3) }).parse(req.body);
      const signal = await store.addSignal({ symbol: body.symbol.toUpperCase(), action: body.action, reason: `[override] ${body.reason}` });
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
      const result = await pipeline.enqueueAnalysis({ symbol: body.symbol.toUpperCase(), price: body.price, source: 'user' });
      res.status(202).json(result);
    } catch (err) { next(err); }
  });

  router.post('/ai/query', async (req, res, next) => {
    try {
      const body = z.object({ query: z.string().min(3) }).parse(req.body);
      const match = body.query.match(/analyze\s+([A-Za-z0-9_-]+)/i);
      if (!match) return res.status(400).json({ error: 'Query format unsupported. Example: Analyze RELIANCE' });
      const symbol = match[1].toUpperCase();
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

  router.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message });
  });

  return router;
}
