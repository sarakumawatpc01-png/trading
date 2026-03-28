import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { InMemoryStore } from './storage/inMemoryStore.js';
import { createClickhouse } from './storage/clickhouse.js';
import { Broadcaster } from './services/broadcaster.js';
import { Logger } from './services/logger.js';
import { AgentService } from './services/agents.js';
import { BrainService } from './services/brain.js';
import { PipelineService } from './services/pipeline.js';
import { IngestionService } from './services/ingestion.js';
import { PythonClient } from './services/pythonClient.js';
import { BacktesterService } from './services/backtester.js';
import { DriftMonitorService } from './services/driftMonitor.js';
import { PaperTraderService } from './services/paperTrader.js';
import { createApp } from './app.js';
import { InMemoryQueue, createRedisQueue } from './queue/queue.js';
import { normalizeIndianSymbol } from './utils/symbol.js';

const store = new InMemoryStore();
const broadcaster = new Broadcaster();
const logger = new Logger(store, broadcaster);
const agents = new AgentService(store);
const brain = new BrainService(store);
const pythonClient = new PythonClient(config);
const backtester = new BacktesterService(store);
const paperTrader = new PaperTraderService(store);
const driftMonitor = new DriftMonitorService(store, agents);

const queue = config.useInMemoryQueue
  ? new InMemoryQueue(logger)
  : createRedisQueue(config, logger);

const pipeline = new PipelineService({
  store,
  queue,
  logger,
  agents,
  brain,
  broadcaster,
  driftMonitor,
  paperTrader
});

const ingestion = new IngestionService(store, logger);
const app = createApp({ store, pipeline, logger, ingestion, agents, pythonClient, backtester });

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => broadcaster.register(ws));

async function bootstrap() {
  try {
    if (!config.useInMemoryQueue) {
      try {
        const ch = createClickhouse(config);
        await ch.initSchemas();
        await store.setHealth({ clickhouse: 'up' });
      } catch (err) {
        await store.setHealth({ clickhouse: 'down' });
        await logger.log('warn', 'ClickHouse unavailable, continuing in in-memory mode', { error: err.message });
      }

      await store.setHealth({ redis: 'up' });
    } else {
      await store.setHealth({ redis: 'in-memory', clickhouse: 'optional' });
    }

    const pyHealth = await pythonClient.health();
    await store.setHealth({ python: pyHealth.status || 'unknown' });

    pipeline.startWorker();

    await store.addStock(normalizeIndianSymbol('RELIANCE'), { sector: 'Energy' });
    await store.addStock(normalizeIndianSymbol('TCS'), { sector: 'IT' });

    server.listen(config.port, async () => {
      await logger.log('info', 'Backend started', { port: config.port });
      // eslint-disable-next-line no-console
      console.log(`Backend listening on ${config.port}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

bootstrap();
