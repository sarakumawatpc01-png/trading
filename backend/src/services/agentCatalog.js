export const AGENTS = [
  'A1_MarketStructure', 'A2_KeyLevels', 'A3_Liquidity', 'A4_OrderFlow', 'A5_Momentum', 'A6_Volatility', 'A7_SmartMoney', 'A8_RiskReward', 'A9_TrendStrength', 'A10_Sentiment', 'A11_PositionSizing', 'A12_Macro', 'A13_RegimeGate', 'A14_Correlation', 'A15_OptionsFlow', 'A16_Seasonality', 'A17_EventRisk', 'A18_Patterns', 'A19_Execution', 'A20_DrawdownControl', 'A21_Anomaly', 'A22_Validation', 'A23_MarketScanner'
];

export const AGENT_SPEC_VERSION = 'v2';

const AGENT_SKILL_PROFILES = {
  A1_MarketStructure: { domain: 'market_structure', focus: ['BOS', 'CHOCH', 'trend-regime'], primarySignal: 'structure_break_quality', riskRule: 'degrade when swing invalidation is weak' },
  A2_KeyLevels: { domain: 'key_levels', focus: ['daily-weekly levels', 'value areas', 'retest quality'], primarySignal: 'level_reaction_strength', riskRule: 'require distance-to-level > spread buffer' },
  A3_Liquidity: { domain: 'liquidity', focus: ['sweeps', 'voids', 'session pockets'], primarySignal: 'liquidity_grab_likelihood', riskRule: 'avoid thin books and post-news spreads' },
  A4_OrderFlow: { domain: 'order_flow', focus: ['aggression imbalance', 'delta shift', 'absorption'], primarySignal: 'flow_imbalance_score', riskRule: 'neutralize during conflicting tape bursts' },
  A5_Momentum: { domain: 'momentum', focus: ['rate-of-change', 'acceleration', 'pullback continuation'], primarySignal: 'impulse_continuation_probability', riskRule: 'downgrade on momentum divergence' },
  A6_Volatility: { domain: 'volatility', focus: ['ATR regime', 'vol clustering', 'expansion/contraction'], primarySignal: 'volatility_state_score', riskRule: 'scale down during extreme variance spikes' },
  A7_SmartMoney: { domain: 'smart_money', focus: ['institutional footprint', 'displacement', 'mitigation blocks'], primarySignal: 'institutional_alignment_score', riskRule: 'wait for confirmation candle close' },
  A8_RiskReward: { domain: 'risk_reward', focus: ['R-multiple quality', 'path efficiency', 'stop/target geometry'], primarySignal: 'expected_r_multiple', riskRule: 'reject trades below minimum reward-to-risk' },
  A9_TrendStrength: { domain: 'trend_strength', focus: ['trend persistence', 'slope', 'pullback depth'], primarySignal: 'trend_strength_index', riskRule: 'block counter-trend entries in strong trends' },
  A10_Sentiment: { domain: 'sentiment', focus: ['news tone', 'macro narrative', 'crowding risk'], primarySignal: 'sentiment_alignment', riskRule: 'cap confidence when sentiment is mixed' },
  A11_PositionSizing: { domain: 'position_sizing', focus: ['capital allocation', 'vol-adjusted size', 'drawdown awareness'], primarySignal: 'size_safety_score', riskRule: 'never exceed configured risk per setup' },
  A12_Macro: { domain: 'macro', focus: ['rates/inflation context', 'sector macro sensitivity', 'event backdrop'], primarySignal: 'macro_regime_alignment', riskRule: 'reduce conviction into major macro prints' },
  A13_RegimeGate: { domain: 'regime_gate', focus: ['risk-on/off classification', 'trend/mean-revert gate', 'session filter'], primarySignal: 'regime_gate_pass', riskRule: 'hard block invalid regime trades' },
  A14_Correlation: { domain: 'correlation', focus: ['index-beta relation', 'sector peers', 'intermarket drift'], primarySignal: 'correlation_consistency', riskRule: 'penalize concentration in correlated bets' },
  A15_OptionsFlow: { domain: 'options_flow', focus: ['OI shifts', 'PCR context', 'gamma zones'], primarySignal: 'options_positioning_bias', riskRule: 'avoid directional calls near high gamma pin risk' },
  A16_Seasonality: { domain: 'seasonality', focus: ['day-of-week edge', 'month-end effects', 'session tendencies'], primarySignal: 'seasonal_edge_score', riskRule: 'treat seasonality as secondary confirmation only' },
  A17_EventRisk: { domain: 'event_risk', focus: ['earnings/calendar risk', 'scheduled announcements', 'surprise gap risk'], primarySignal: 'event_risk_score', riskRule: 'switch to WAIT around high-impact events' },
  A18_Patterns: { domain: 'patterns', focus: ['continuation/reversal structures', 'breakout reliability', 'failure patterns'], primarySignal: 'pattern_validity_score', riskRule: 'invalidate pattern on broken structure rules' },
  A19_Execution: { domain: 'execution', focus: ['entry timing', 'slippage control', 'order plan'], primarySignal: 'execution_quality_score', riskRule: 'refuse setups with poor fill expectancy' },
  A20_DrawdownControl: { domain: 'drawdown_control', focus: ['loss streak guardrails', 'daily max loss', 'capital protection'], primarySignal: 'drawdown_pressure', riskRule: 'auto throttle after adverse streaks' },
  A21_Anomaly: { domain: 'anomaly', focus: ['outlier detection', 'data sanity checks', 'regime breaks'], primarySignal: 'anomaly_risk_score', riskRule: 'downgrade or block when anomaly risk is high' },
  A22_Validation: { domain: 'validation', focus: ['cross-agent consistency', 'signal integrity', 'reasonability checks'], primarySignal: 'validation_pass_rate', riskRule: 'veto when consistency checks fail' },
  A23_MarketScanner: { domain: 'market_scanner', focus: ['universe ranking', 'opportunity clustering', 'priority queueing'], primarySignal: 'setup_priority_score', riskRule: 'prioritize liquidity and execution viability' }
};

export function createDefaultAgentSpecs() {
  return Object.fromEntries(
    AGENTS.map((agentName) => ([
      agentName,
      {
        instruction: `Specialist ${agentName}: own the ${AGENT_SKILL_PROFILES[agentName].domain} layer, produce auditable signal reasoning, and enforce risk-first gating before contributing to final decision.`,
        knowledge: `Knowledge ${AGENT_SPEC_VERSION}: India/NSE market microstructure, regime-sensitive behavior, session dynamics, and strict normalization/risk constraints tailored for ${AGENT_SKILL_PROFILES[agentName].domain}.`,
        skill: {
          profileVersion: AGENT_SPEC_VERSION,
          role: 'specialist',
          mode: 'deterministic-evaluable',
          objectives: [
            'maximize signal quality for owned domain',
            'minimize false positives via explicit risk gates',
            'emit concise machine-readable rationale fields'
          ],
          ...AGENT_SKILL_PROFILES[agentName],
          outputContract: {
            scoreRange: [0, 10],
            confidenceRange: [0, 1],
            requiredFields: ['bias', 'confidence', 'trace']
          },
          escalationRules: {
            onConflict: 'reduce conviction and request WAIT bias',
            onLowDataQuality: 'return neutral with anomaly flag'
          }
        }
      }
    ]))
  );
}
