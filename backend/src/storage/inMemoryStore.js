import { uid } from '../utils/id.js';

const nowIso = () => new Date().toISOString();

export class InMemoryStore {
  constructor() {
    this.stocks = [];
    this.signals = [];
    this.setups = [];
    this.agentOutputs = [];
    this.logs = [];
    this.systemConfig = {
      agentWeights: {},
      brainInstructions: 'Default: prioritize high consensus and risk discipline.',
      apiConfig: {
        newsProvider: 'mock-news-v1',
        marketProvider: 'mock-market-v1'
      }
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
    const stock = { id: uid('stock'), symbol, meta, createdAt: nowIso(), active: true };
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
    const row = { id: uid('signal'), ...signal, createdAt: nowIso() };
    this.signals.unshift(row);
    return row;
  }
  async listSignals(limit = 50) { return this.signals.slice(0, limit); }

  async addSetup(setup) {
    const row = { id: uid('setup'), ...setup, createdAt: nowIso() };
    this.setups.unshift(row);
    return row;
  }
  async listSetups(limit = 50) { return this.setups.slice(0, limit); }

  async addAgentOutputs(outputs) {
    const items = outputs.map((o) => ({ id: uid('agent_out'), ...o, createdAt: nowIso() }));
    this.agentOutputs.unshift(...items);
    return items;
  }
  async listAgentOutputs(limit = 200) { return this.agentOutputs.slice(0, limit); }

  async addLog(log) {
    const row = { id: uid('log'), ...log, createdAt: nowIso() };
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
    return this.systemConfig;
  }

  async setHealth(partial) {
    this.health = { ...this.health, ...partial };
    return this.health;
  }
  async getHealth() { return this.health; }
}
