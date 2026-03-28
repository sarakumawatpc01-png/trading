export const AGENTS = [
  'A1_MarketStructure', 'A2_KeyLevels', 'A3_Liquidity', 'A4_OrderFlow', 'A5_Momentum', 'A6_Volatility', 'A7_SmartMoney', 'A8_RiskReward', 'A9_TrendStrength', 'A10_Sentiment', 'A11_PositionSizing', 'A12_Macro', 'A13_RegimeGate', 'A14_Correlation', 'A15_OptionsFlow', 'A16_Seasonality', 'A17_EventRisk', 'A18_Patterns', 'A19_Execution', 'A20_DrawdownControl', 'A21_Anomaly', 'A22_Validation', 'A23_MarketScanner'
];

export const AGENT_SPEC_VERSION = 'v1';

export function createDefaultAgentSpecs() {
  return Object.fromEntries(
    AGENTS.map((agentName) => ([
      agentName,
      {
        instruction: `Baseline ${agentName}: analyze your domain signal and produce concise rationale aligned with risk-first policy.`,
        knowledge: `Baseline knowledge ${AGENT_SPEC_VERSION}: NSE intraday context, liquidity awareness, and regime-consistent behavior for ${agentName}.`,
        skill: {
          profileVersion: AGENT_SPEC_VERSION,
          mode: 'baseline',
          calibration: 'deterministic'
        }
      }
    ]))
  );
}
