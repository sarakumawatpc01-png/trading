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
      `CREATE TABLE IF NOT EXISTS oracle.system_config (id String, payload String, createdAt DateTime) ENGINE = ReplacingMergeTree(createdAt) ORDER BY id`
    ];

    for (const q of statements) {
      await client.command({ query: q });
    }
  }

  return { client, initSchemas };
}
