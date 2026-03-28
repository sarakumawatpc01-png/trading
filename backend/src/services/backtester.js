export class BacktesterService {
  constructor(store) {
    this.store = store;
  }

  async labelOutcome(setupId, payload) {
    return this.store.labelOutcome(setupId, payload);
  }

  async runBacktest({ symbol, lookback = 200 }) {
    const summary = await this.store.summarizeBacktest(symbol, lookback);
    return this.store.addBacktestResult(summary);
  }

  async getBacktest(id) {
    return this.store.getBacktestResult(id);
  }
}
