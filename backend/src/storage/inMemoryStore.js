import { uid } from '../utils/id.js';
import { INDIA_TIME_ZONE } from '../utils/marketHours.js';
import { normalizeIndianSymbol } from '../utils/symbol.js';

// sv-SE provides stable YYYY-MM-DD HH:mm:ss ordering; we convert it to an IST-local timestamp shape.
const nowIstLocal = () => new Date().toLocaleString('sv-SE', { timeZone: INDIA_TIME_ZONE }).replace(' ', 'T');
const BASELINE_AGENT_WEIGHT = 1;
const AGENT_WEIGHT_MIN = 0.5;
const AGENT_WEIGHT_MAX = 1.5;
const MAX_SETUP_LOOKBACK = 1000;

export class InMemoryStore {
  constructor() {
    this.stocks = [];
    this.signals = [];
    this.setups = [];
    this.setupById = new Map();
    this.setupsBySymbol = new Map();
    this.agentOutputs = [];
    this.agentSpecs = {};
    this.outcomes = [];
    this.backtests = [];
    this.driftLogs = [];
    this.paperTrades = [];
    this.logs = [];
    this.systemConfig = {
      agentWeights: {},
      brainInstructions: 'Default: prioritize high consensus and risk discipline. Prioritize regime alignment with the NIFTY 50 trend. Avoid low liquidity sessions before 9:30 AM IST. Factor in Indian market dynamics.',
      useEVBrain: true,
      evMinThreshold: 0.12,
      minWinRate: 0.45,
      autoReweightEnabled: true,
      driftThreshold: 0.2,
      paperModeEnabled: false,
      paperInitialCapital: 100000,
      apiConfig: {
        newsProvider: 'mock-news-v1',
        marketProvider: 'mock-market-v1'
      }
    };
    this.paperPortfolio = {
      balance: this.systemConfig.paperInitialCapital,
      initialCapital: this.systemConfig.paperInitialCapital,
      realizedPnl: 0
    };
    this.health = {
      redis: 'unknown',
      clickhouse: 'unknown',
      python: 'unknown',
      queueDepth: 0
    };
  }

  async listStocks() { return this.stocks; }
  async addStock(symbol, meta = {}) {
    const stock = { id: uid('stock'), symbol: normalizeIndianSymbol(symbol), meta, createdAt: nowIstLocal(), active: true };
    this.stocks.push(stock);
    return stock;
  }
  async removeStock(id) {
    const idx = this.stocks.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.stocks.splice(idx, 1);
    return true;
  }

  async addSignal(signal) {
    const row = { id: uid('signal'), ...signal, createdAt: nowIstLocal() };
    this.signals.unshift(row);
    return row;
  }
  async listSignals(limit = 50) { return this.signals.slice(0, limit); }

  async addSetup(setup) {
    const row = { id: uid('setup'), ...setup, createdAt: nowIstLocal() };
    this.setups.unshift(row);
    this.setupById.set(row.id, row);
    if (!this.setupsBySymbol.has(row.symbol)) this.setupsBySymbol.set(row.symbol, []);
    this.setupsBySymbol.get(row.symbol).unshift(row);
    return row;
  }
  async listSetups(limit = 50) { return this.setups.slice(0, limit); }
  async getSetupById(id) { return this.setupById.get(id) || null; }

  async addAgentOutputs(outputs) {
    const items = outputs.map((o) => ({ id: uid('agent_out'), ...o, createdAt: nowIstLocal() }));
    this.agentOutputs.unshift(...items);
    return items;
  }
  async listAgentOutputs(limit = 200) { return this.agentOutputs.slice(0, limit); }
  async listAgentOutputsByRunId(runId) { return this.agentOutputs.filter((x) => x.runId === runId); }

  async listAgentSpecs() { return this.agentSpecs; }
  async getAgentSpec(name) { return this.agentSpecs[name] || null; }
  async patchAgentSpec(name, partial) {
    const current = this.agentSpecs[name] || { instruction: '', knowledge: '', skill: {} };
    const next = {
      ...current,
      ...partial,
      skill: { ...(current.skill || {}), ...(partial.skill || {}) },
      updatedAt: nowIstLocal()
    };
    this.agentSpecs[name] = next;
    return next;
  }

  async addLog(log) {
    const row = { id: uid('log'), ...log, createdAt: nowIstLocal() };
    this.logs.unshift(row);
    return row;
  }
  async listLogs(limit = 200) { return this.logs.slice(0, limit); }

  async getConfig() { return this.systemConfig; }
  async patchConfig(partial) {
    this.systemConfig = {
      ...this.systemConfig,
      ...partial,
      apiConfig: { ...this.systemConfig.apiConfig, ...(partial.apiConfig || {}) },
      agentWeights: { ...this.systemConfig.agentWeights, ...(partial.agentWeights || {}) }
    };
    if (partial.paperInitialCapital && typeof partial.paperInitialCapital === 'number') {
      this.paperPortfolio.initialCapital = partial.paperInitialCapital;
      if (!this.paperTrades.some((t) => t.status === 'OPEN')) {
        this.paperPortfolio.balance = partial.paperInitialCapital + this.paperPortfolio.realizedPnl;
      }
    }
    return this.systemConfig;
  }

  async listOutcomes(limit = 200) { return this.outcomes.slice(0, limit); }
  async addOutcome(outcome) {
    const row = { id: uid('outcome'), ...outcome, createdAt: nowIstLocal() };
    this.outcomes.unshift(row);
    return row;
  }
  async labelOutcome(setupId, partial) {
    const setup = await this.getSetupById(setupId);
    if (!setup) return null;
    const entryPrice = Number(partial.entryPrice ?? setup?.triggerPrice ?? setup?.entryPrice ?? 0);
    const exitPrice = Number(partial.exitPrice);
    if (!entryPrice || !exitPrice) return null;
    const quantity = Number(partial.quantity ?? 1);
    const pnl = Number(((exitPrice - entryPrice) * quantity).toFixed(2));
    const pnlPercent = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(3));
    return this.addOutcome({
      setupId,
      runId: setup.runId,
      symbol: setup.symbol,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      pnlPercent,
      status: pnl >= 0 ? 'WIN' : 'LOSS',
      exitReason: partial.exitReason || 'manual_label'
    });
  }
  async getHistoricalStats(symbol) {
    const rows = this.outcomes.filter((x) => !symbol || x.symbol === symbol);
    if (!rows.length) {
      return { sampleSize: 0, winRate: 0.5, avgWin: 0, avgLoss: 0, profitFactor: 1, expectancy: 0 };
    }
    const wins = rows.filter((x) => x.pnl > 0);
    const losses = rows.filter((x) => x.pnl < 0);
    const avgWin = wins.length ? wins.reduce((a, b) => a + b.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b.pnl, 0) / losses.length) : 0;
    const grossWin = wins.reduce((a, b) => a + b.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
    const winRate = wins.length / rows.length;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 10 : 1;
    const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
    return {
      sampleSize: rows.length,
      winRate: Number(winRate.toFixed(4)),
      avgWin: Number(avgWin.toFixed(3)),
      avgLoss: Number(avgLoss.toFixed(3)),
      profitFactor: Number(profitFactor.toFixed(3)),
      expectancy: Number(expectancy.toFixed(3))
    };
  }

  async addBacktestResult(result) {
    const row = { id: uid('backtest'), ...result, createdAt: nowIstLocal() };
    this.backtests.unshift(row);
    return row;
  }
  async getBacktestResult(id) { return this.backtests.find((x) => x.id === id) || null; }

  async addDriftLog(log) {
    const row = { id: uid('drift'), ...log, createdAt: nowIstLocal() };
    this.driftLogs.unshift(row);
    return row;
  }
  async listDriftLogs(limit = 200) { return this.driftLogs.slice(0, limit); }

  async reweightAgents(weights) {
    const normalized = Object.fromEntries(
      Object.entries(weights || {}).map(([agent, value]) => [
        agent,
        Number(Math.max(AGENT_WEIGHT_MIN, Math.min(AGENT_WEIGHT_MAX, value)).toFixed(3))
      ])
    );
    return this.patchConfig({ agentWeights: normalized });
  }

  async getRecentSetupsBySymbol(symbol, max = MAX_SETUP_LOOKBACK) {
    return (this.setupsBySymbol.get(symbol) || []).slice(0, max);
  }

  async openPaperTrade(data) {
    const trade = { id: uid('paper_trade'), ...data, status: 'OPEN', createdAt: nowIstLocal() };
    this.paperTrades.unshift(trade);
    return trade;
  }
  async closePaperTrade(id, data = {}) {
    const trade = this.paperTrades.find((x) => x.id === id);
    if (!trade || trade.status !== 'OPEN') return null;
    const exitPrice = Number(data.exitPrice);
    if (!exitPrice) return null;
    const quantity = Number(trade.quantity || 0);
    const pnl = Number(((exitPrice - Number(trade.entryPrice)) * quantity).toFixed(2));
    trade.exitPrice = exitPrice;
    trade.status = 'CLOSED';
    trade.closedAt = nowIstLocal();
    trade.exitReason = data.exitReason || 'manual';
    trade.pnl = pnl;
    this.paperPortfolio.realizedPnl = Number((this.paperPortfolio.realizedPnl + pnl).toFixed(2));
    this.paperPortfolio.balance = Number((this.systemConfig.paperInitialCapital + this.paperPortfolio.realizedPnl).toFixed(2));
    return trade;
  }
  async listPaperTrades(limit = 200) { return this.paperTrades.slice(0, limit); }
  async getPaperPortfolio() {
    const openTrades = this.paperTrades.filter((t) => t.status === 'OPEN').length;
    return { ...this.paperPortfolio, openTrades };
  }

  defaultAgentWeight() {
    return BASELINE_AGENT_WEIGHT;
  }

  async setHealth(partial) {
    this.health = { ...this.health, ...partial };
    return this.health;
  }
  async getHealth() { return this.health; }
}
