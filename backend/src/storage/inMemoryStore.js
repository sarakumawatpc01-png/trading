import { uid } from '../utils/id.js';
import { INDIA_TIME_ZONE } from '../utils/marketHours.js';
import { normalizeIndianSymbol } from '../utils/symbol.js';
import { AGENTS, AGENT_SPEC_VERSION } from '../services/agentCatalog.js';
import { loadAgentSpecsFromFiles } from '../services/agentSpecLoader.js';
import { DEFAULT_EVENT_CALENDAR, normalizeCalendarEvent } from '../services/eventCalendar.js';

// sv-SE provides stable YYYY-MM-DD HH:mm:ss ordering; we convert it to an IST-local timestamp shape.
const nowIstLocal = () => new Date().toLocaleString('sv-SE', { timeZone: INDIA_TIME_ZONE }).replace(' ', 'T');
const BASELINE_AGENT_WEIGHT = 1;
const AGENT_WEIGHT_MIN = 0.5;
const AGENT_WEIGHT_MAX = 1.5;
const MAX_SETUP_LOOKBACK = 1000;
const PERCENT_BASE = 100;
const DEFAULT_PAPER_SLIPPAGE_BPS = 3;
const DEFAULT_PAPER_FEE_BPS = 2;
const DEFAULT_PAPER_LATENCY_MS = 120;
const BACKTEST_MIN_SAMPLE_SIZE = 20;
const CONFIDENCE_Z_SCORE = 1.96;
const RELIABILITY_PRIOR_SAMPLES = 10;
const RELIABILITY_MIN_WEIGHT = 0.6;
const RELIABILITY_MAX_WEIGHT = 1.4;
const CALIBRATION_MIN_BIN_SAMPLES = 10;
const CALIBRATION_BIN_SIZE = 0.1;

function computeWilsonInterval(wins, total) {
  if (!total) return { low: 0, high: 0 };
  const p = wins / total;
  const z2 = CONFIDENCE_Z_SCORE ** 2;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const spread = CONFIDENCE_Z_SCORE * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total ** 2));
  const low = Math.max(0, (center - spread) / denominator);
  const high = Math.min(1, (center + spread) / denominator);
  return {
    low: Number(low.toFixed(4)),
    high: Number(high.toFixed(4))
  };
}

function isWithinDays(createdAt, days) {
  if (!days || days <= 0) return true;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return true;
  const ageMs = Date.now() - timestamp;
  return ageMs <= days * 24 * 60 * 60 * 1000;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export class InMemoryStore {
  constructor() {
    this.stocks = [];
    this.signals = [];
    this.setups = [];
    this.setupById = new Map();
    this.setupsBySymbol = new Map();
    this.agentOutputs = [];
    this.agentSpecs = loadAgentSpecsFromFiles({ agents: AGENTS, specVersion: AGENT_SPEC_VERSION });
    this.outcomes = [];
    this.backtests = [];
    this.driftLogs = [];
    this.decisionAudits = [];
    this.riskEvents = [];
    this.paperTrades = [];
    this.logs = [];
    this.systemConfig = {
      agentWeights: {},
      brainInstructions: 'Default: prioritize high consensus and risk discipline. Prioritize regime alignment with the NIFTY 50 trend. Avoid low liquidity sessions before 9:30 AM IST. Factor in Indian market dynamics.',
      useEVBrain: true,
      evMinThreshold: 0.12,
      minWinRate: 0.45,
      minSymbolWinRateForTake: 0.45,
      forceOverrideDisagreement: false,
      autoReweightEnabled: true,
      autoReweightMode: 'drift',
      driftThreshold: 0.2,
      stockOverrides: {},
      setupConfidenceDecayHours: 4,
      paperModeEnabled: false,
      paperInitialCapital: 100000,
      autoShutdownDrawdownPercent: 20,
      paperExecution: {
        slippageBps: DEFAULT_PAPER_SLIPPAGE_BPS,
        feeBps: DEFAULT_PAPER_FEE_BPS,
        latencyMs: DEFAULT_PAPER_LATENCY_MS
      },
      setupMinRiskReward: 1.2,
      maxEstimatedCostBps: 15,
      noTradeMinConsensus: 0.5,
      noTradeHighVolStdevThreshold: 2.9,
      eventCalendar: DEFAULT_EVENT_CALENDAR.map((event) => normalizeCalendarEvent(event)),
      prefilterConfig: {
        momentumModulus: 10,
        volumeModulus: 7,
        momentumWeight: 0.6,
        volumeWeight: 0.4,
        triggerThreshold: 4.2
      },
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
  async listAgentOutputsBySymbol(symbol, limit = 200) {
    return this.agentOutputs.filter((x) => x.symbol === symbol).slice(0, limit);
  }

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
  async patchAgentSpecsBulk(specs = {}) {
    const nextEntries = await Promise.all(
      Object.entries(specs).map(async ([name, partial]) => [name, await this.patchAgentSpec(name, partial)])
    );
    return Object.fromEntries(nextEntries);
  }

  async addLog(log) {
    const row = { id: uid('log'), ...log, createdAt: nowIstLocal() };
    this.logs.unshift(row);
    return row;
  }
  async listLogs(limit = 200) { return this.logs.slice(0, limit); }

  async getConfig() { return this.systemConfig; }
  validateConfigField(key, value) {
    const numericValue = Number(value);
    const validateRange = (min, max) => Number.isFinite(numericValue) && numericValue >= min && numericValue <= max;
    switch (key) {
      case 'minWinRate':
      case 'minSymbolWinRateForTake':
        return validateRange(0, 1) ? null : `${key} must be between 0 and 1`;
      case 'setupConfidenceDecayHours':
        return validateRange(1, 24) ? null : `${key} must be between 1 and 24`;
      case 'autoShutdownDrawdownPercent':
        return validateRange(0, 100) ? null : `${key} must be between 0 and 100`;
      case 'setupMinRiskReward':
        return validateRange(0.5, 10) ? null : `${key} must be between 0.5 and 10`;
      case 'maxEstimatedCostBps':
        return validateRange(0, 100) ? null : `${key} must be between 0 and 100`;
      case 'noTradeMinConsensus':
        return validateRange(0, 1) ? null : `${key} must be between 0 and 1`;
      case 'noTradeHighVolStdevThreshold':
        return validateRange(0, 10) ? null : `${key} must be between 0 and 10`;
      case 'paperExecution.slippageBps':
      case 'paperExecution.feeBps':
        return validateRange(0, 100) ? null : `${key} must be between 0 and 100`;
      case 'paperExecution.latencyMs':
        return validateRange(0, 10000) ? null : `${key} must be between 0 and 10000`;
      default:
        return null;
    }
  }
  normalizeEventCalendar(events = []) {
    if (!Array.isArray(events)) return [];
    return events
      .map((event) => normalizeCalendarEvent(event))
      .filter((event) => event.id && event.date);
  }
  getConfigSchema() {
    return {
      minWinRate: { min: 0, max: 1 },
      minSymbolWinRateForTake: { min: 0, max: 1 },
      setupConfidenceDecayHours: { min: 1, max: 24 },
      autoShutdownDrawdownPercent: { min: 0, max: 100 },
      setupMinRiskReward: { min: 0.5, max: 10 },
      maxEstimatedCostBps: { min: 0, max: 100 },
      noTradeMinConsensus: { min: 0, max: 1 },
      noTradeHighVolStdevThreshold: { min: 0, max: 10 },
      paperExecution: {
        slippageBps: { min: 0, max: 100 },
        feeBps: { min: 0, max: 100 },
        latencyMs: { min: 0, max: 10000 }
      },
      eventCalendar: {
        item: { required: ['id', 'title', 'date'], optional: ['symbols', 'impact'] }
      }
    };
  }
  async patchConfig(partial) {
    if (partial.paperInitialCapital && typeof partial.paperInitialCapital === 'number' && this.paperTrades.some((t) => t.status === 'OPEN')) {
      throw new Error('Cannot change paperInitialCapital while open paper trades exist');
    }
    const directKeys = [
      'minWinRate',
      'minSymbolWinRateForTake',
      'setupConfidenceDecayHours',
      'autoShutdownDrawdownPercent',
      'setupMinRiskReward',
      'maxEstimatedCostBps',
      'noTradeMinConsensus',
      'noTradeHighVolStdevThreshold'
    ];
    for (const key of directKeys) {
      if (partial[key] !== undefined) {
        const validationError = this.validateConfigField(key, partial[key]);
        if (validationError) throw new Error(validationError);
      }
    }
    const paperExecution = partial.paperExecution || {};
    for (const paperKey of ['slippageBps', 'feeBps', 'latencyMs']) {
      if (paperExecution[paperKey] !== undefined) {
        const validationError = this.validateConfigField(`paperExecution.${paperKey}`, paperExecution[paperKey]);
        if (validationError) throw new Error(validationError);
      }
    }
    this.systemConfig = {
      ...this.systemConfig,
      ...partial,
      apiConfig: { ...this.systemConfig.apiConfig, ...(partial.apiConfig || {}) },
      agentWeights: { ...this.systemConfig.agentWeights, ...(partial.agentWeights || {}) },
      stockOverrides: { ...this.systemConfig.stockOverrides, ...(partial.stockOverrides || {}) },
      prefilterConfig: { ...this.systemConfig.prefilterConfig, ...(partial.prefilterConfig || {}) },
      paperExecution: { ...this.systemConfig.paperExecution, ...(partial.paperExecution || {}) },
      eventCalendar: partial.eventCalendar !== undefined
        ? this.normalizeEventCalendar(partial.eventCalendar)
        : this.systemConfig.eventCalendar
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
    const outcome = await this.addOutcome({
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
    await this.updateReliabilityFromOutcome(setup, outcome);
    return outcome;
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
  async getHistoricalStatsByRegime(symbol, regime = {}) {
    const rows = this.outcomes.filter((outcome) => {
      if (symbol && outcome.symbol !== symbol) return false;
      const setup = this.setupById.get(outcome.setupId);
      if (!setup || !setup.regime) return false;
      if (regime.trendState && setup.regime.trendState !== regime.trendState) return false;
      if (regime.volBucket && setup.regime.volBucket !== regime.volBucket) return false;
      if (regime.eventDay && setup.regime.eventDay !== regime.eventDay) return false;
      return true;
    });
    if (!rows.length) {
      return { sampleSize: 0, hitRate: 0, expectancy: 0 };
    }
    const wins = rows.filter((x) => Number(x.pnl || 0) > 0).length;
    const expectancy = rows.reduce((acc, row) => acc + Number(row.pnl || 0), 0) / rows.length;
    return {
      sampleSize: rows.length,
      hitRate: Number((wins / rows.length).toFixed(4)),
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

  async addDecisionAudit(log) {
    const row = { id: uid('decision_audit'), ...log, createdAt: nowIstLocal() };
    this.decisionAudits.unshift(row);
    return row;
  }
  async listDecisionAuditsBySymbol(symbol, limit = 50) {
    return this.decisionAudits.filter((x) => x.symbol === symbol).slice(0, limit);
  }
  async listDecisionAudits(limit = 200) {
    return this.decisionAudits.slice(0, limit);
  }
  async getAgentContributionMetrics({ symbol, days = 30, agent } = {}) {
    const audits = this.decisionAudits.filter((audit) => {
      if (symbol && audit.symbol !== symbol) return false;
      return isWithinDays(audit.createdAt, days);
    });
    const outcomesByRun = new Map();
    for (const outcome of this.outcomes) {
      if (symbol && outcome.symbol !== symbol) continue;
      if (!isWithinDays(outcome.createdAt, days)) continue;
      const current = outcomesByRun.get(outcome.runId) || [];
      current.push(outcome);
      outcomesByRun.set(outcome.runId, current);
    }
    const metrics = new Map();
    const rawContributions = [];
    for (const audit of audits) {
      const relatedOutcomes = outcomesByRun.get(audit.runId) || [];
      const realizedPnl = relatedOutcomes.reduce((acc, row) => acc + Number(row.pnl || 0), 0);
      const decisionFactor = audit.decision === 'TAKE' ? 1 : audit.decision === 'SKIP' ? -0.5 : 0.25;
      const voteRows = (audit.agentVotes || []).map((vote) => ({
        agent: vote.agent,
        score: Number(vote.score || 0),
        directionalScore: (Number(vote.score || 0) - 5) / 5
      }));
      const directionalMean = voteRows.length
        ? voteRows.reduce((acc, vote) => acc + vote.directionalScore, 0) / voteRows.length
        : 0;
      const directionalVariance = voteRows.length
        ? voteRows.reduce((acc, vote) => acc + (vote.directionalScore - directionalMean) ** 2, 0) / voteRows.length
        : 0;
      const directionalScale = Math.sqrt(Math.max(directionalVariance, 0));
      for (const vote of audit.agentVotes || []) {
        if (agent && vote.agent !== agent) continue;
        const item = metrics.get(vote.agent) || {
          agent: vote.agent,
          sampleSize: 0,
          resolvedSampleSize: 0,
          wins: 0,
          losses: 0,
          avgScore: 0,
          weightedExposure: 0,
          weightedVariance: 0,
          contributionScore: 0,
          realizedPnl: 0
        };
        item.sampleSize += 1;
        item.avgScore += Number(vote.score || 0);
        if (relatedOutcomes.length) {
          item.resolvedSampleSize += 1;
          item.realizedPnl += realizedPnl;
          if (realizedPnl > 0) item.wins += 1;
          if (realizedPnl < 0) item.losses += 1;
          const directionalScore = (Number(vote.score || 0) - 5) / 5;
          const idioExposure = directionalScore - directionalMean;
          const variancePenalty = 1 / (1 + directionalScale);
          const causalWeight = idioExposure * variancePenalty * decisionFactor;
          const weightedPnl = causalWeight * realizedPnl;
          item.weightedExposure += causalWeight;
          item.weightedVariance += Math.abs(idioExposure);
          item.contributionScore += weightedPnl;
          rawContributions.push(weightedPnl);
        }
        metrics.set(vote.agent, item);
      }
    }
    const baselineMean = rawContributions.length
      ? rawContributions.reduce((acc, value) => acc + value, 0) / rawContributions.length
      : 0;
    const baselineVariance = rawContributions.length
      ? rawContributions.reduce((acc, value) => acc + (value - baselineMean) ** 2, 0) / rawContributions.length
      : 0;
    const baselineStdDev = Math.sqrt(Math.max(0, baselineVariance));
    return [...metrics.values()]
      .map((row) => ({
        ...row,
        avgScore: Number((row.avgScore / Math.max(row.sampleSize, 1)).toFixed(3)),
        hitRate: row.resolvedSampleSize ? Number((row.wins / row.resolvedSampleSize).toFixed(4)) : 0,
        weightedExposure: Number(row.weightedExposure.toFixed(4)),
        weightedVariance: Number((row.weightedVariance / Math.max(1, row.resolvedSampleSize)).toFixed(4)),
        causalZScore: baselineStdDev > 0
          ? Number(((row.contributionScore - baselineMean) / baselineStdDev).toFixed(4))
          : 0,
        contributionScore: Number(row.contributionScore.toFixed(3)),
        realizedPnl: Number(row.realizedPnl.toFixed(2))
      }))
      .sort((a, b) => b.contributionScore - a.contributionScore);
  }
  async getSignalEffectiveness({ symbol, days = 30, limit = 20 } = {}) {
    const grouped = new Map();
    for (const outcome of this.outcomes) {
      if (symbol && outcome.symbol !== symbol) continue;
      if (!isWithinDays(outcome.createdAt, days)) continue;
      const setup = this.setupById.get(outcome.setupId);
      if (!setup || !setup.regime) continue;
      const trendState = setup.regime.trendState || 'UNKNOWN';
      const volBucket = setup.regime.volBucket || 'UNKNOWN';
      const eventDay = setup.regime.eventDay || 'NORMAL';
      const key = `${setup.symbol}|${setup.decision}|${trendState}|${volBucket}|${eventDay}`;
      const row = grouped.get(key) || {
        symbol: setup.symbol,
        decision: setup.decision,
        trendState,
        volBucket,
        eventDay,
        sampleSize: 0,
        wins: 0,
        pnlSum: 0
      };
      row.sampleSize += 1;
      const pnl = Number(outcome.pnl || 0);
      if (pnl > 0) row.wins += 1;
      row.pnlSum += pnl;
      grouped.set(key, row);
    }
    return [...grouped.values()]
      .map((row) => ({
        ...row,
        hitRate: Number((row.wins / Math.max(1, row.sampleSize)).toFixed(4)),
        expectancy: Number((row.pnlSum / Math.max(1, row.sampleSize)).toFixed(3)),
        pnlSum: Number(row.pnlSum.toFixed(2))
      }))
      .sort((a, b) => b.sampleSize - a.sampleSize)
      .slice(0, limit);
  }
  async getRegimeHitRateMatrix({ symbol, days = 60 } = {}) {
    const grouped = new Map();
    for (const outcome of this.outcomes) {
      if (symbol && outcome.symbol !== symbol) continue;
      if (!isWithinDays(outcome.createdAt, days)) continue;
      const setup = this.setupById.get(outcome.setupId);
      if (!setup || !setup.regime) continue;
      const key = `${setup.regime.trendState}|${setup.regime.volBucket}|${setup.regime.eventDay}`;
      const row = grouped.get(key) || {
        trendState: setup.regime.trendState,
        volBucket: setup.regime.volBucket,
        eventDay: setup.regime.eventDay,
        sampleSize: 0,
        wins: 0,
        pnlSum: 0
      };
      row.sampleSize += 1;
      const pnl = Number(outcome.pnl || 0);
      if (pnl > 0) row.wins += 1;
      row.pnlSum += pnl;
      grouped.set(key, row);
    }
    return [...grouped.values()].map((row) => ({
      ...row,
      hitRate: Number((row.wins / Math.max(1, row.sampleSize)).toFixed(4)),
      expectancy: Number((row.pnlSum / Math.max(1, row.sampleSize)).toFixed(3)),
      confidenceInterval: computeWilsonInterval(row.wins, row.sampleSize),
      minSampleMet: row.sampleSize >= BACKTEST_MIN_SAMPLE_SIZE
    }));
  }

  async addRiskEvent(event) {
    const row = { id: uid('risk_event'), ...event, createdAt: nowIstLocal() };
    this.riskEvents.unshift(row);
    return row;
  }
  async listRiskEvents(limit = 200) {
    return this.riskEvents.slice(0, limit);
  }

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

  async getLatestRegimeForSymbol(symbol) {
    const latest = (this.setupsBySymbol.get(symbol) || [])[0];
    return latest?.regime || null;
  }

  async openPaperTrade(data) {
    const trade = { id: uid('paper_trade'), ...data, status: 'OPEN', createdAt: nowIstLocal() };
    this.paperTrades.unshift(trade);
    return trade;
  }
  async closePaperTrade(id, data = {}) {
    const trade = this.paperTrades.find((x) => x.id === id);
    if (!trade || trade.status !== 'OPEN') return null;
    const requestedExitPrice = Number(data.exitPrice);
    if (!requestedExitPrice) return null;
    const executionConfig = this.systemConfig.paperExecution || {};
    const slippageBps = Number(executionConfig.slippageBps ?? DEFAULT_PAPER_SLIPPAGE_BPS);
    const feeBps = Number(executionConfig.feeBps ?? DEFAULT_PAPER_FEE_BPS);
    const effectiveExitPrice = Number((requestedExitPrice * (1 - slippageBps / (PERCENT_BASE * PERCENT_BASE))).toFixed(4));
    const quantity = Number(trade.quantity || 0);
    const grossPnl = Number(((effectiveExitPrice - Number(trade.entryPrice)) * quantity).toFixed(2));
    const turnover = Number(trade.entryPrice) * quantity + effectiveExitPrice * quantity;
    const fees = Number((turnover * (feeBps / (PERCENT_BASE * PERCENT_BASE))).toFixed(2));
    const pnl = Number((grossPnl - fees).toFixed(2));
    trade.exitPrice = effectiveExitPrice;
    trade.requestedExitPrice = requestedExitPrice;
    trade.status = 'CLOSED';
    trade.closedAt = nowIstLocal();
    trade.exitReason = data.exitReason || 'manual';
    trade.executionAssumptions = { slippageBps, feeBps, latencyMs: Number(executionConfig.latencyMs ?? DEFAULT_PAPER_LATENCY_MS) };
    trade.grossPnl = grossPnl;
    trade.fees = fees;
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
  async summarizeBacktest(symbol, lookback = 200) {
    const setups = await this.getRecentSetupsBySymbol(symbol, lookback);
    const takeSetups = setups.filter((setup) => setup.decision === 'TAKE');
    const outcomesBySetupId = new Map(this.outcomes.map((row) => [row.setupId, row]));
    const resolved = takeSetups
      .map((setup) => outcomesBySetupId.get(setup.id))
      .filter(Boolean);
    const wins = resolved.filter((row) => Number(row.pnl || 0) > 0);
    const sampleSize = resolved.length;
    const hitRate = sampleSize ? wins.length / sampleSize : 0;
    const avgConfidence = setups.length
      ? setups.reduce((acc, row) => acc + Number(row.confidence || 0), 0) / setups.length
      : 0;
    const expectancy = sampleSize
      ? resolved.reduce((acc, row) => acc + Number(row.pnl || 0), 0) / sampleSize
      : 0;
    const confidenceInterval = computeWilsonInterval(wins.length, sampleSize);
    const minSampleMet = sampleSize >= BACKTEST_MIN_SAMPLE_SIZE;
    const unresolvedCount = Math.max(0, takeSetups.length - sampleSize);
    const warnings = [];
    if (!minSampleMet) warnings.push(`Sample size ${sampleSize} below minimum ${BACKTEST_MIN_SAMPLE_SIZE}`);
    if (unresolvedCount > 0) warnings.push(`${unresolvedCount} TAKE setups unresolved and excluded`);
    return {
      symbol,
      lookback,
      sampleSize: setups.length,
      takeCount: takeSetups.length,
      resolvedTakeCount: sampleSize,
      unresolvedTakeCount: unresolvedCount,
      hitRate: Number(hitRate.toFixed(4)),
      hitRateCiLow: confidenceInterval.low,
      hitRateCiHigh: confidenceInterval.high,
      avgConfidence: Number(avgConfidence.toFixed(4)),
      expectancy: Number(expectancy.toFixed(3)),
      minSampleSize: BACKTEST_MIN_SAMPLE_SIZE,
      minSampleMet,
      warnings
    };
  }

  async runWalkForwardBacktest(symbol, options = {}) {
    const lookback = Math.max(40, Number(options.lookback || 300));
    const trainWindow = Math.max(20, Number(options.trainWindow || 80));
    const testWindow = Math.max(10, Number(options.testWindow || 30));
    const setups = (await this.getRecentSetupsBySymbol(symbol, lookback)).slice().reverse();
    const outcomesBySetupId = new Map(this.outcomes.map((row) => [row.setupId, row]));
    const windows = [];
    let cursor = trainWindow;
    while (cursor + testWindow <= setups.length) {
      const trainRows = setups.slice(cursor - trainWindow, cursor);
      const testRows = setups.slice(cursor, cursor + testWindow);
      const trainResolved = trainRows.map((setup) => outcomesBySetupId.get(setup.id)).filter(Boolean);
      const testResolved = testRows.map((setup) => outcomesBySetupId.get(setup.id)).filter(Boolean);
      const trainWins = trainResolved.filter((row) => Number(row.pnl || 0) > 0).length;
      const testWins = testResolved.filter((row) => Number(row.pnl || 0) > 0).length;
      const trainHitRate = trainResolved.length ? trainWins / trainResolved.length : 0;
      const testHitRate = testResolved.length ? testWins / testResolved.length : 0;
      windows.push({
        index: windows.length + 1,
        trainSample: trainResolved.length,
        testSample: testResolved.length,
        trainHitRate: Number(trainHitRate.toFixed(4)),
        testHitRate: Number(testHitRate.toFixed(4)),
        drift: Number((testHitRate - trainHitRate).toFixed(4))
      });
      cursor += testWindow;
    }
    const validWindows = windows.filter((row) => row.testSample > 0);
    const averageTestHitRate = validWindows.length
      ? validWindows.reduce((acc, row) => acc + row.testHitRate, 0) / validWindows.length
      : 0;
    const averageDrift = validWindows.length
      ? validWindows.reduce((acc, row) => acc + row.drift, 0) / validWindows.length
      : 0;
    return {
      symbol,
      lookback,
      trainWindow,
      testWindow,
      windows,
      averageTestHitRate: Number(averageTestHitRate.toFixed(4)),
      averageDrift: Number(averageDrift.toFixed(4)),
      windowCount: windows.length
    };
  }

  getCalibrationBin(confidence) {
    const value = Math.max(0, Math.min(1, Number(confidence || 0)));
    const scaled = Math.floor(value * 10);
    return Number((scaled / 10).toFixed(1));
  }

  normalizeCalibrationMap(map = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(map || {})) {
      const total = Number(value?.total || 0);
      const wins = Number(value?.wins || 0);
      normalized[key] = { total, wins };
    }
    return normalized;
  }

  applyConfidenceCalibration(rawConfidence, calibration = {}) {
    const bin = this.getCalibrationBin(rawConfidence).toFixed(1);
    const row = calibration[bin];
    if (!row || Number(row.total || 0) < CALIBRATION_MIN_BIN_SAMPLES) return Number(rawConfidence);
    return Number((Number(row.wins || 0) / Number(row.total || 1)).toFixed(3));
  }

  getReliabilityWeight(agentName, regime = {}) {
    const metrics = this.systemConfig.agentReliability?.[agentName];
    if (!metrics) return 1;
    const key = `${regime.trendState || 'UNKNOWN'}|${regime.volBucket || 'UNKNOWN'}|${regime.eventDay || 'NORMAL'}`;
    const row = metrics.byRegime?.[key] || metrics.global || null;
    if (!row) return 1;
    const total = Number(row.total || 0);
    const wins = Number(row.wins || 0);
    const smoothedHitRate = (wins + RELIABILITY_PRIOR_SAMPLES * 0.5) / (total + RELIABILITY_PRIOR_SAMPLES);
    const reliabilityScale = 1 + (smoothedHitRate - 0.5);
    return Number(Math.max(RELIABILITY_MIN_WEIGHT, Math.min(RELIABILITY_MAX_WEIGHT, reliabilityScale)).toFixed(3));
  }

  async updateReliabilityFromOutcome(setup, outcome) {
    const wins = Number(outcome.pnl || 0) > 0 ? 1 : 0;
    const audits = this.decisionAudits.filter((item) => item.runId === setup.runId);
    const nextReliability = cloneJson(this.systemConfig.agentReliability || {});
    for (const audit of audits) {
      for (const vote of audit.agentVotes || []) {
        const agentName = String(vote.agent || '');
        if (!agentName) continue;
        if (!nextReliability[agentName]) nextReliability[agentName] = { global: { wins: 0, total: 0 }, byRegime: {} };
        nextReliability[agentName].global.wins += wins;
        nextReliability[agentName].global.total += 1;
        const regimeKey = `${setup?.regime?.trendState || 'UNKNOWN'}|${setup?.regime?.volBucket || 'UNKNOWN'}|${setup?.regime?.eventDay || 'NORMAL'}`;
        if (!nextReliability[agentName].byRegime[regimeKey]) nextReliability[agentName].byRegime[regimeKey] = { wins: 0, total: 0 };
        nextReliability[agentName].byRegime[regimeKey].wins += wins;
        nextReliability[agentName].byRegime[regimeKey].total += 1;
      }
    }
    const nextCalibration = this.normalizeCalibrationMap(this.systemConfig.confidenceCalibration || {});
    const bin = this.getCalibrationBin(setup?.confidence || 0).toFixed(1);
    if (!nextCalibration[bin]) nextCalibration[bin] = { wins: 0, total: 0 };
    nextCalibration[bin].wins += wins;
    nextCalibration[bin].total += 1;
    this.systemConfig = {
      ...this.systemConfig,
      agentReliability: nextReliability,
      confidenceCalibration: nextCalibration
    };
  }

  snapshotState() {
    return {
      stocks: cloneJson(this.stocks),
      signals: cloneJson(this.signals),
      setups: cloneJson(this.setups),
      setupById: new Map(this.setupById),
      setupsBySymbol: new Map([...this.setupsBySymbol.entries()].map(([key, rows]) => [key, cloneJson(rows)])),
      agentOutputs: cloneJson(this.agentOutputs),
      agentSpecs: cloneJson(this.agentSpecs),
      outcomes: cloneJson(this.outcomes),
      backtests: cloneJson(this.backtests),
      driftLogs: cloneJson(this.driftLogs),
      decisionAudits: cloneJson(this.decisionAudits),
      riskEvents: cloneJson(this.riskEvents),
      paperTrades: cloneJson(this.paperTrades),
      logs: cloneJson(this.logs),
      systemConfig: cloneJson(this.systemConfig),
      paperPortfolio: cloneJson(this.paperPortfolio),
      health: cloneJson(this.health)
    };
  }

  restoreState(snapshot) {
    this.stocks = cloneJson(snapshot.stocks || []);
    this.signals = cloneJson(snapshot.signals || []);
    this.setups = cloneJson(snapshot.setups || []);
    this.setupById = new Map(snapshot.setupById || []);
    this.setupsBySymbol = new Map(snapshot.setupsBySymbol || []);
    this.agentOutputs = cloneJson(snapshot.agentOutputs || []);
    this.agentSpecs = cloneJson(snapshot.agentSpecs || {});
    this.outcomes = cloneJson(snapshot.outcomes || []);
    this.backtests = cloneJson(snapshot.backtests || []);
    this.driftLogs = cloneJson(snapshot.driftLogs || []);
    this.decisionAudits = cloneJson(snapshot.decisionAudits || []);
    this.riskEvents = cloneJson(snapshot.riskEvents || []);
    this.paperTrades = cloneJson(snapshot.paperTrades || []);
    this.logs = cloneJson(snapshot.logs || []);
    this.systemConfig = cloneJson(snapshot.systemConfig || {});
    this.paperPortfolio = cloneJson(snapshot.paperPortfolio || {});
    this.health = cloneJson(snapshot.health || {});
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
