import { getEventDayTag } from './eventCalendar.js';

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
const MIN_DECAY_FACTOR = 0;
const MAX_DECAY_FACTOR = 1;
const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_CONFIDENCE_DECAY_HOURS = 4;
const DEFAULT_MIN_CONFIDENCE_TO_TAKE = 0.2;
const TREND_STRONG_THRESHOLD = 6.6;
const TREND_WEAK_THRESHOLD = 5.5;
const TREND_RANGE_THRESHOLD = 4.5;
const HIGH_VOL_STDEV_THRESHOLD = 2.5;
const NORMAL_VOL_STDEV_THRESHOLD = 1.5;
const DEFAULT_MIN_RISK_REWARD = 1.2;
const DEFAULT_MAX_COST_BPS = 15;
const DEFAULT_MIN_CONSENSUS = 0.5;
const DEFAULT_NO_TRADE_VOL_THRESHOLD = 2.9;

function detectRegime({ symbol, avg, stdev, triggerContext = {}, eventCalendar = [] }) {
  let trendState = 'RANGE';
  if (avg >= TREND_STRONG_THRESHOLD) trendState = 'STRONG_TREND';
  else if (avg >= TREND_WEAK_THRESHOLD) trendState = 'WEAK_TREND';
  else if (avg <= TREND_RANGE_THRESHOLD) trendState = 'MEAN_REVERT';

  let volBucket = 'NORMAL_VOL';
  if (stdev >= HIGH_VOL_STDEV_THRESHOLD) volBucket = 'HIGH_VOL';
  else if (stdev <= NORMAL_VOL_STDEV_THRESHOLD) volBucket = 'LOW_VOL';

  const source = String(triggerContext.source || '').toLowerCase();
  const timestampMs = Number(triggerContext?.triggeredAtMs || Date.now());
  const eventTag = getEventDayTag({ symbol, timestampMs, calendar: eventCalendar });
  const sourceFallback = source.includes('news') ? 'EVENT' : source.includes('upload') ? 'PRE_EVENT' : 'NORMAL';
  const eventDay = eventTag.eventDay === 'NORMAL' ? sourceFallback : eventTag.eventDay;

  return { trendState, volBucket, eventDay, eventName: eventTag.event?.title || null, eventImpact: eventTag.event?.impact || null };
}

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
    const effectiveDisagreement = disagreement && !Boolean(config.forceOverrideDisagreement);
    const thresholdTake = Number(config.takeThreshold ?? DEFAULT_TAKE_THRESHOLD);
    const thresholdSkip = Number(config.skipThreshold ?? DEFAULT_SKIP_THRESHOLD);
    const fallbackDecision = effectiveDisagreement ? 'WAIT' : avg >= thresholdTake ? 'TAKE' : avg <= thresholdSkip ? 'SKIP' : 'WAIT';
    let evDecision = 'WAIT';
    const evMinThreshold = Number(config.evMinThreshold ?? 0.12);
    const minWinRate = Number(config.minWinRate ?? config.minSymbolWinRateForTake ?? 0.45);
    if (effectiveDisagreement) {
      evDecision = 'WAIT';
    } else if (ev >= evMinThreshold && stats.winRate >= minWinRate) {
      evDecision = 'TAKE';
    } else if (ev < 0) {
      evDecision = 'SKIP';
    }
    let decision = useEVBrain ? evDecision : fallbackDecision;

    let decisionReason = 'base';
    if (decision === 'TAKE' && stats.winRate < Number(config.minSymbolWinRateForTake ?? minWinRate)) {
      decision = 'WAIT';
      decisionReason = 'win_rate_gate';
    }

    const stockOverride = config.stockOverrides?.[symbol] || null;
    const stopLossTakeFactor = Number(stockOverride?.slMultiplier ?? STOP_LOSS_TAKE_FACTOR);
    const targetsFactors = Array.isArray(stockOverride?.targetFactors) && stockOverride.targetFactors.length
      ? stockOverride.targetFactors.map((value) => Number(value)).filter(Number.isFinite)
      : TARGET_FACTORS;

    const now = Date.now();
    const triggerTimestamp = Number(triggerContext?.triggeredAtMs);
    const triggeredAtMs = Number.isFinite(triggerTimestamp) && triggerTimestamp > 0 ? triggerTimestamp : now;
    const elapsedMs = Math.max(0, now - triggeredAtMs);
    const decayHours = Number(config.setupConfidenceDecayHours ?? DEFAULT_CONFIDENCE_DECAY_HOURS);
    const decayRatio = decayHours > 0 ? elapsedMs / (decayHours * MS_PER_HOUR) : 0;
    const confidenceDecayFactor = Number(Math.max(MIN_DECAY_FACTOR, Math.min(MAX_DECAY_FACTOR, 1 - decayRatio)).toFixed(3));

    const entryLow = Number((triggerContext?.price * ENTRY_LOW_FACTOR).toFixed(2));
    const entryHigh = Number((triggerContext?.price * ENTRY_HIGH_FACTOR).toFixed(2));
    const stopLossFactor = decision === 'TAKE' ? stopLossTakeFactor : STOP_LOSS_WAIT_OR_SKIP_FACTOR;
    const stopLoss = Number((triggerContext?.price * stopLossFactor).toFixed(2));
    const targets = targetsFactors.map((factor) => Number((triggerContext?.price * factor).toFixed(2)));
    const rawConfidence = Number((avg / 10).toFixed(3));
    const effectiveConfidence = Number((rawConfidence * confidenceDecayFactor).toFixed(3));
    const minConfidenceToTake = Number(config.minConfidenceToTake ?? DEFAULT_MIN_CONFIDENCE_TO_TAKE);
    if (decision === 'TAKE' && effectiveConfidence < minConfidenceToTake) {
      decision = 'WAIT';
      decisionReason = 'confidence_decay_gate';
    }

    const eventCalendar = Array.isArray(config.eventCalendar) ? config.eventCalendar : [];
    const regime = detectRegime({ symbol, avg, stdev, triggerContext, eventCalendar });
    const calibratedConfidence = this.store.applyConfidenceCalibration(rawConfidence, config.confidenceCalibration || {});
    const minConsensus = Number(config.noTradeMinConsensus ?? DEFAULT_MIN_CONSENSUS);
    const noTradeVolThreshold = Number(config.noTradeHighVolStdevThreshold ?? DEFAULT_NO_TRADE_VOL_THRESHOLD);
    if (decision === 'TAKE' && (avg / 10) < minConsensus) {
      decision = 'WAIT';
      decisionReason = 'no_trade_low_consensus';
    }
    if (decision === 'TAKE' && regime.volBucket === 'HIGH_VOL' && stdev >= noTradeVolThreshold) {
      decision = 'WAIT';
      decisionReason = 'no_trade_high_volatility';
    }

    const targetOne = Number(targets?.[0] || 0);
    const rawRiskPerUnit = Number(triggerContext?.price || 0) - Number(stopLoss || 0);
    const riskPerUnit = Math.max(0, rawRiskPerUnit);
    const rewardPerUnit = Math.max(0, targetOne - Number(triggerContext?.price || 0));
    const invalidRiskGeometry = riskPerUnit <= 0 || rewardPerUnit <= 0;
    if (decision === 'TAKE' && invalidRiskGeometry) {
      decision = 'WAIT';
      decisionReason = 'invalid_risk_geometry';
    }
    const riskReward = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
    const minRiskReward = Number(config.setupMinRiskReward ?? DEFAULT_MIN_RISK_REWARD);
    if (decision === 'TAKE' && riskReward < minRiskReward) {
      decision = 'WAIT';
      decisionReason = 'risk_reward_gate';
    }
    const estimatedCostBps = Number((Number(config.paperExecution?.slippageBps || 0) + Number(config.paperExecution?.feeBps || 0)).toFixed(2));
    const maxEstimatedCostBps = Number(config.maxEstimatedCostBps ?? DEFAULT_MAX_COST_BPS);
    if (decision === 'TAKE' && estimatedCostBps > maxEstimatedCostBps) {
      decision = 'WAIT';
      decisionReason = 'cost_gate';
    }

    const setup = {
      runId,
      symbol,
      decision,
      confidence: rawConfidence,
      calibratedConfidence,
      effectiveConfidence,
      confidenceDecayFactor,
      entryZone: `${entryLow}-${entryHigh}`,
      stopLoss,
      targets,
      triggerPrice: triggerContext?.price,
      ev,
      regime,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      riskReward: Number(riskReward.toFixed(3)),
      estimatedCostBps,
      rationale: `${decision} with avg=${avg.toFixed(2)} stdev=${stdev.toFixed(2)} ev=${ev.toFixed(3)} winRate=${stats.winRate.toFixed(3)} confidence=${effectiveConfidence.toFixed(3)} reason=${decisionReason}. Instructions: ${config.brainInstructions}`
    };

    return { setup, disagreement: effectiveDisagreement, avg, stdev, ev };
  }
}
