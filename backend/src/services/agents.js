import { AGENTS } from './agentCatalog.js';

const HASH_MULTIPLIER = 31;
const HASH_MODULUS = 9973;
const SCORE_SCALE = 100;
const SCORE_DIVISOR = 10;

function seededScore(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * HASH_MULTIPLIER + seed.charCodeAt(i)) % HASH_MODULUS;
  return (h % SCORE_SCALE) / SCORE_DIVISOR;
}

export class AgentService {
  constructor(store) {
    this.store = store;
  }

  listAgents() {
    return AGENTS;
  }

  async runAll({ symbol, context, runId }) {
    const config = await this.store.getConfig();
    const outputs = [];
    const regime = context?.regime || {};
    for (const agent of AGENTS) {
      const spec = await this.store.getAgentSpec(agent);
      const base = seededScore(`${symbol}:${agent}:${JSON.stringify(context).slice(0, 100)}`);
      const baseWeight = Number(config.agentWeights?.[agent] ?? 1);
      const reliabilityWeight = Number(this.store.getReliabilityWeight(agent, regime) || 1);
      const weight = Number((baseWeight * reliabilityWeight).toFixed(3));
      const score = Math.max(0, Math.min(10, Number((base * weight).toFixed(2))));
      outputs.push({
        runId,
        agent,
        symbol,
        score,
        summary: `${agent} analyzed ${symbol} and produced score ${score}`,
        payload: {
          bias: score > 6 ? 'BULLISH' : score < 4 ? 'BEARISH' : 'NEUTRAL',
          confidence: score / 10,
          trace: 'deterministic-mock-v1',
          instruction: spec?.instruction || null,
          knowledge: spec?.knowledge || null,
          skill: spec?.skill || {},
          reliabilityWeight
        }
      });
    }

    await this.store.addAgentOutputs(outputs);
    return outputs;
  }
}
