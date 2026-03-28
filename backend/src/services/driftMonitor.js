const MIN_OUTCOMES_FOR_DRIFT = 10;
const WEIGHT_ADJUSTMENT_STEP = 0.1;
const PERCENT_BASE = 100;
const FALLBACK_LOWER_QUANTILE = 0.25;
const FALLBACK_UPPER_QUANTILE = 0.75;

export class DriftMonitorService {
  constructor(store, agents) {
    this.store = store;
    this.agents = agents;
  }

  async detectDrift(symbol) {
    const stats = await this.store.getHistoricalStats(symbol);
    const config = await this.store.getConfig();
    const baseline = Number(config.minWinRate || 0.45);
    const driftScore = Number((baseline - stats.winRate).toFixed(4));
    const isDrift = stats.sampleSize >= MIN_OUTCOMES_FOR_DRIFT && driftScore > Number(config.driftThreshold || 0.2);
    return { symbol, isDrift, driftScore, baseline, stats };
  }

  async autoReweightIfNeeded(symbol) {
    const detection = await this.detectDrift(symbol);
    const config = await this.store.getConfig();
    await this.checkAndApplyDrawdownKillSwitch(config);
    if (!config.autoReweightEnabled) return detection;

    const mode = String(config.autoReweightMode || 'drift');
    if (mode === 'winrate-percentile') {
      const outcomeRows = await this.store.listOutcomes(1000);
      const symbolRows = outcomeRows.filter((x) => x.symbol === symbol);
      if (symbolRows.length < MIN_OUTCOMES_FOR_DRIFT) return detection;
      const sortedPnl = symbolRows.map((x) => Number(x.pnl || 0)).sort((a, b) => a - b);
      const lowerIdx = Math.floor((sortedPnl.length - 1) * FALLBACK_LOWER_QUANTILE);
      const upperIdx = Math.floor((sortedPnl.length - 1) * FALLBACK_UPPER_QUANTILE);
      const lower = sortedPnl[Math.max(0, lowerIdx)];
      const upper = sortedPnl[Math.min(sortedPnl.length - 1, upperIdx)];
      const recentAgentOutputs = await this.store.listAgentOutputsBySymbol(symbol, 300);
      const grouped = new Map();
      for (const output of recentAgentOutputs) {
        if (!grouped.has(output.agent)) grouped.set(output.agent, []);
        grouped.get(output.agent).push(Number(output.score || 0));
      }

      const current = config.agentWeights || {};
      const updates = {};
      for (const agentName of this.agents.listAgents()) {
        const currentWeight = Number(current[agentName] ?? this.store.defaultAgentWeight());
        const scores = grouped.get(agentName) || [];
        const avgScore = scores.length ? scores.reduce((acc, val) => acc + val, 0) / scores.length : 5;
        if (avgScore >= 6 && upper > 0) {
          updates[agentName] = currentWeight + WEIGHT_ADJUSTMENT_STEP;
        } else if (avgScore <= 4 || lower < 0) {
          updates[agentName] = currentWeight - WEIGHT_ADJUSTMENT_STEP;
        } else {
          updates[agentName] = currentWeight;
        }
      }
      await this.store.reweightAgents(updates);
      await this.store.addDriftLog({
        symbol,
        driftScore: detection.driftScore,
        action: 'REWEIGHTED_PERCENTILE',
        affectedAgents: this.agents.listAgents().length
      });
      return { ...detection, reweighted: true, mode };
    }
    if (!detection.isDrift) return detection;
    if (mode !== 'drift') return detection;

    const current = config.agentWeights || {};
    const updates = {};
    for (const agentName of this.agents.listAgents()) {
      const currentWeight = Number(current[agentName] ?? this.store.defaultAgentWeight());
      updates[agentName] = currentWeight - WEIGHT_ADJUSTMENT_STEP;
    }
    await this.store.reweightAgents(updates);
    await this.store.addDriftLog({
      symbol,
      driftScore: detection.driftScore,
      action: 'REWEIGHTED',
      affectedAgents: this.agents.listAgents().length
    });
    return { ...detection, reweighted: true, mode };
  }

  async checkAndApplyDrawdownKillSwitch(config) {
    const portfolio = await this.store.getPaperPortfolio();
    const threshold = Number(config.autoShutdownDrawdownPercent || 0);
    if (threshold <= 0 || portfolio.initialCapital <= 0) return;
    const drawdownPercent = Number((((portfolio.initialCapital - portfolio.balance) / portfolio.initialCapital) * PERCENT_BASE).toFixed(3));
    if (drawdownPercent < threshold) return;
    if (!config.paperModeEnabled) return;
    await this.store.patchConfig({ paperModeEnabled: false });
    await this.store.addRiskEvent({
      eventType: 'DRAWDOWN_KILL_SWITCH',
      drawdownPercent,
      threshold,
      action: 'paperModeDisabled'
    });
    await this.store.addDriftLog({
      symbol: 'SYSTEM',
      driftScore: 0,
      action: 'KILL_SWITCH_TRIGGERED',
      affectedAgents: 0
    });
  }
}
