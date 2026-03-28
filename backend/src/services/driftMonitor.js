const MIN_OUTCOMES_FOR_DRIFT = 10;
const WEIGHT_ADJUSTMENT_STEP = 0.1;

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
    if (!detection.isDrift) return detection;
    const config = await this.store.getConfig();
    if (!config.autoReweightEnabled) return detection;

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
    return { ...detection, reweighted: true };
  }
}
