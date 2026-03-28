export class BrainService {
  constructor(store) {
    this.store = store;
  }

  async decide({ symbol, runId, agentOutputs, triggerContext }) {
    const config = await this.store.getConfig();
    const scores = agentOutputs.map((x) => x.score);
    const avg = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
    const stdev = Math.sqrt(scores.reduce((a, s) => a + Math.pow(s - avg, 2), 0) / Math.max(scores.length, 1));

    const disagreement = stdev > 2.8;
    const decision = disagreement ? 'WAIT' : avg >= 6.2 ? 'TAKE' : avg <= 3.8 ? 'SKIP' : 'WAIT';

    const entryLow = Number((triggerContext?.price * 0.997).toFixed(2));
    const entryHigh = Number((triggerContext?.price * 1.003).toFixed(2));
    const stopLoss = Number((triggerContext?.price * (decision === 'TAKE' ? 0.99 : 1.01)).toFixed(2));
    const targets = [
      Number((triggerContext?.price * 1.01).toFixed(2)),
      Number((triggerContext?.price * 1.02).toFixed(2)),
      Number((triggerContext?.price * 1.03).toFixed(2))
    ];

    const setup = {
      runId,
      symbol,
      decision,
      confidence: Number((avg / 10).toFixed(3)),
      entryZone: `${entryLow}-${entryHigh}`,
      stopLoss,
      targets,
      rationale: `${decision} with avg=${avg.toFixed(2)} stdev=${stdev.toFixed(2)}. Instructions: ${config.brainInstructions}`
    };

    return { setup, disagreement, avg, stdev };
  }
}
