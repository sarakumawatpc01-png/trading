export class PaperTraderService {
  constructor(store) {
    this.store = store;
  }

  async openFromSetup(setup, quantity = 1) {
    const entryFromZone = Number(String(setup.entryZone || '').split('-')[0]);
    const triggerPrice = Number(setup.triggerPrice || entryFromZone || 0);
    const config = await this.store.getConfig();
    const paperExecution = config.paperExecution || {};
    const slippageBps = Number(paperExecution.slippageBps ?? 3);
    const entryPrice = Number((triggerPrice * (1 + slippageBps / 10000)).toFixed(4));
    if (!entryPrice) return null;
    return this.store.openPaperTrade({
      setupId: setup.id,
      runId: setup.runId,
      symbol: setup.symbol,
      entryPrice,
      requestedEntryPrice: triggerPrice,
      quantity: Number(quantity),
      stopLoss: setup.stopLoss,
      targets: setup.targets,
      executionAssumptions: {
        slippageBps,
        feeBps: Number(paperExecution.feeBps ?? 2),
        latencyMs: Number(paperExecution.latencyMs ?? 120)
      }
    });
  }

  async closeTrade(id, payload) {
    return this.store.closePaperTrade(id, payload);
  }

  async listTrades(limit = 200) {
    return this.store.listPaperTrades(limit);
  }

  async getPortfolio() {
    return this.store.getPaperPortfolio();
  }
}
