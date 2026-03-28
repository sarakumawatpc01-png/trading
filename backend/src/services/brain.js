const DISAGREEMENT_THRESHOLD = 2.8;
const TAKE_THRESHOLD = 6.2;
const SKIP_THRESHOLD = 3.8;
const ENTRY_LOW_FACTOR = 0.997;
const ENTRY_HIGH_FACTOR = 1.003;
const STOP_LOSS_TAKE_FACTOR = 0.99;
const STOP_LOSS_WAIT_OR_SKIP_FACTOR = 1.01;
const TARGET_FACTORS = [1.01, 1.02, 1.03];

export class BrainService {
  constructor(store) {
    this.store = store;
  }

  async decide({ symbol, runId, agentOutputs, triggerContext }) {
    const config = await this.store.getConfig();
    const scores = agentOutputs.map((x) => x.score);
    const avg = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
    const stdev = Math.sqrt(scores.reduce((a, s) => a + Math.pow(s - avg, 2), 0) / Math.max(scores.length, 1));

    const disagreement = stdev > DISAGREEMENT_THRESHOLD;
    const decision = disagreement ? 'WAIT' : avg >= TAKE_THRESHOLD ? 'TAKE' : avg <= SKIP_THRESHOLD ? 'SKIP' : 'WAIT';

    const entryLow = Number((triggerContext?.price * ENTRY_LOW_FACTOR).toFixed(2));
    const entryHigh = Number((triggerContext?.price * ENTRY_HIGH_FACTOR).toFixed(2));
    const stopLossFactor = decision === 'TAKE' ? STOP_LOSS_TAKE_FACTOR : STOP_LOSS_WAIT_OR_SKIP_FACTOR;
    const stopLoss = Number((triggerContext?.price * stopLossFactor).toFixed(2));
    const targets = TARGET_FACTORS.map((factor) => Number((triggerContext?.price * factor).toFixed(2)));

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
