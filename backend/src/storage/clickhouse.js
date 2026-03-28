import { createClient } from '@clickhouse/client';

export function createClickhouse(config) {
  const client = createClient({
    host: config.clickhouseUrl,
    username: config.clickhouseUser,
    password: config.clickhousePassword
  });

  async function initSchemas() {
    const statements = [
      `CREATE DATABASE IF NOT EXISTS oracle`,
      `CREATE TABLE IF NOT EXISTS oracle.setups (id String, symbol String, decision String, confidence Float32, entryZone String, stopLoss Float64, targets String, rationale String, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.agent_outputs (id String, runId String, agent String, symbol String, score Float32, summary String, payload String, createdAt DateTime) ENGINE = MergeTree ORDER BY (runId, agent, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.stocks (id String, symbol String, meta String, active UInt8, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.logs (id String, level String, message String, context String, createdAt DateTime) ENGINE = MergeTree ORDER BY (createdAt, level)`,
      `CREATE TABLE IF NOT EXISTS oracle.signals (id String, symbol String, action String, reason String, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.system_config (id String, payload String, createdAt DateTime) ENGINE = ReplacingMergeTree(createdAt) ORDER BY id`,
      `CREATE TABLE IF NOT EXISTS oracle.agent_specs (id String, agent String, instruction String, knowledge String, skill String, createdAt DateTime) ENGINE = MergeTree ORDER BY (agent, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.outcomes (id String, setupId String, runId String, symbol String, entryPrice Float64, exitPrice Float64, quantity Float64, pnl Float64, pnlPercent Float64, status String, exitReason String, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.backtests (id String, symbol String, lookback Int32, sampleSize Int32, takeCount Int32, hitRate Float64, avgConfidence Float64, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.drift_logs (id String, symbol String, driftScore Float64, action String, affectedAgents Int32, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`,
      `CREATE TABLE IF NOT EXISTS oracle.paper_trades (id String, setupId String, runId String, symbol String, entryPrice Float64, quantity Float64, stopLoss Float64, targets String, exitPrice Float64, status String, exitReason String, pnl Float64, createdAt DateTime) ENGINE = MergeTree ORDER BY (symbol, createdAt)`
    ];

    for (const q of statements) {
      await client.command({ query: q });
    }
  }

  return { client, initSchemas };
}
