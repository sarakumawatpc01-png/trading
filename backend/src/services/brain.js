const DISAGREEMENT_THRESHOLD = 2.8;
const TAKE_THRESHOLD = 6.2;
const SKIP_THRESHOLD = 3.8;
const ENTRY_LOW_FACTOR = 0.997;
const ENTRY_HIGH_FACTOR = 1.003;
const STOP_LOSS_TAKE_FACTOR = 0.99;
const STOP_LOSS_WAIT_OR_SKIP_FACTOR = 1.01;
const TARGET_FACTORS = [1.01, 1.02, 1.03];
const EV_STDEV_PENALTY_FACTOR = 0.5;
const EV_BOOST_IF_AGREEMENT = 0.1;
const DEFAULT_TAKE_THRESHOLD = TAKE_THRESHOLD;
const DEFAULT_SKIP_THRESHOLD = SKIP_THRESHOLD;

export class BrainService {
  constructor(store) {
    this.store = store;
  }

  async calculateEV({ symbol, avg, stdev }) {
    const stats = await this.store.getHistoricalStats(symbol);
    const probabilityWin = stats.winRate;
    const probabilityLoss = 1 - probabilityWin;
    const avgWin = Math.max(stats.avgWin, 1);
    const avgLoss = Math.max(stats.avgLoss, 1);
    const rawEv = probabilityWin * avgWin - probabilityLoss * avgLoss;
    const stdevPenalty = stdev * EV_STDEV_PENALTY_FACTOR;
    const consensusBoost = stdev <= DISAGREEMENT_THRESHOLD ? EV_BOOST_IF_AGREEMENT : 0;
    const ev = Number((rawEv - stdevPenalty + consensusBoost).toFixed(3));
    return { ev, stats };
  }

  async decide({ symbol, runId, agentOutputs, triggerContext }) {
    const config = await this.store.getConfig();
    const scores = agentOutputs.map((x) => x.score);
    const avg = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
    const stdev = Math.sqrt(scores.reduce((a, s) => a + Math.pow(s - avg, 2), 0) / Math.max(scores.length, 1));
    const { ev, stats } = await this.calculateEV({ symbol, avg, stdev });
    const useEVBrain = Boolean(config.useEVBrain);

    const disagreement = stdev > DISAGREEMENT_THRESHOLD;
    const thresholdTake = Number(config.takeThreshold ?? DEFAULT_TAKE_THRESHOLD);
    const thresholdSkip = Number(config.skipThreshold ?? DEFAULT_SKIP_THRESHOLD);
    const fallbackDecision = disagreement ? 'WAIT' : avg >= thresholdTake ? 'TAKE' : avg <= thresholdSkip ? 'SKIP' : 'WAIT';
    let evDecision = 'WAIT';
    const evMinThreshold = Number(config.evMinThreshold ?? 0.12);
    const minWinRate = Number(config.minWinRate ?? 0.45);
    if (disagreement) {
      evDecision = 'WAIT';
    } else if (ev >= evMinThreshold && stats.winRate >= minWinRate) {
      evDecision = 'TAKE';
    } else if (ev < 0) {
      evDecision = 'SKIP';
    }
    const decision = useEVBrain ? evDecision : fallbackDecision;

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
      triggerPrice: triggerContext?.price,
      ev,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      rationale: `${decision} with avg=${avg.toFixed(2)} stdev=${stdev.toFixed(2)} ev=${ev.toFixed(3)} winRate=${stats.winRate.toFixed(3)}. Instructions: ${config.brainInstructions}`
    };

    return { setup, disagreement, avg, stdev, ev };
  }
}
