export class PaperTraderService {
  constructor(store) {
    this.store = store;
  }

  async openFromSetup(setup, quantity = 1) {
    const entryFromZone = Number(String(setup.entryZone || '').split('-')[0]);
    const entryPrice = Number(setup.triggerPrice || entryFromZone || 0);
    if (!entryPrice) return null;
    return this.store.openPaperTrade({
      setupId: setup.id,
      runId: setup.runId,
      symbol: setup.symbol,
      entryPrice,
      quantity: Number(quantity),
      stopLoss: setup.stopLoss,
      targets: setup.targets
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
