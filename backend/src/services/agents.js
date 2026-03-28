const AGENTS = [
  'A1_MarketStructure','A2_KeyLevels','A3_Liquidity','A4_OrderFlow','A5_Momentum','A6_Volatility','A7_SmartMoney','A8_RiskReward','A9_TrendStrength','A10_Sentiment','A11_PositionSizing','A12_Macro','A13_RegimeGate','A14_Correlation','A15_OptionsFlow','A16_Seasonality','A17_EventRisk','A18_Patterns','A19_Execution','A20_DrawdownControl','A21_Anomaly','A22_Validation','A23_MarketScanner'
];

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
    for (const agent of AGENTS) {
      const spec = await this.store.getAgentSpec(agent);
      const base = seededScore(`${symbol}:${agent}:${JSON.stringify(context).slice(0, 100)}`);
      const weight = Number(config.agentWeights?.[agent] ?? 1);
      const score = Math.max(0, Math.min(10, Number((base * weight).toFixed(2))));
      outputs.push({
        runId,
        agent,
        symbol,
        score,
        summary: `${agent} analyzed ${symbol} and produced score ${score}${spec?.instruction ? ` using instruction` : ''}`,
        payload: {
          bias: score > 6 ? 'BULLISH' : score < 4 ? 'BEARISH' : 'NEUTRAL',
          confidence: score / 10,
          trace: 'deterministic-mock-v1',
          instruction: spec?.instruction || null,
          knowledge: spec?.knowledge || null,
          skill: spec?.skill || {}
        }
      });
    }

    await this.store.addAgentOutputs(outputs);
    return outputs;
  }
}
