export class BacktesterService {
  constructor(store) {
    this.store = store;
  }

  async labelOutcome(setupId, payload) {
    return this.store.labelOutcome(setupId, payload);
  }

  async runBacktest({ symbol, lookback = 200 }) {
    const setups = await this.store.getRecentSetupsBySymbol(symbol, lookback);
    if (!setups.length) {
      return this.store.addBacktestResult({
        symbol,
        lookback,
        sampleSize: 0,
        takeCount: 0,
        hitRate: 0,
        avgConfidence: 0
      });
    }

    const takeSetups = setups.filter((s) => s.decision === 'TAKE');
    const pseudoWins = takeSetups.filter((s) => s.confidence >= 0.6).length;
    const hitRate = takeSetups.length ? pseudoWins / takeSetups.length : 0;
    const avgConfidence = setups.reduce((acc, s) => acc + Number(s.confidence || 0), 0) / setups.length;

    return this.store.addBacktestResult({
      symbol,
      lookback,
      sampleSize: setups.length,
      takeCount: takeSetups.length,
      hitRate: Number(hitRate.toFixed(4)),
      avgConfidence: Number(avgConfidence.toFixed(4))
    });
  }

  async getBacktest(id) {
    return this.store.getBacktestResult(id);
  }
}
