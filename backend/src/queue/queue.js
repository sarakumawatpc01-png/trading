import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_PROCESSING_DELAY_MS = 5;

export class InMemoryQueue {
  constructor(logger) {
    this.logger = logger;
    this.handlers = [];
  }
  add(data) {
    setTimeout(async () => {
      for (const h of this.handlers) {
        try {
          await h(data);
        } catch (err) {
          await this.logger.log('error', 'InMemory queue handler failed', { error: err.message });
        }
      }
    }, QUEUE_PROCESSING_DELAY_MS);
  }
  process(handler) { this.handlers.push(handler); }
  async count() { return 0; }
}

export function createRedisQueue(config, logger) {
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('oracle-analysis', { connection });
  let worker;

  return {
    add: (data) => queue.add('analysis', data, { attempts: 3, backoff: { type: 'exponential', delay: 1500 } }),
    process: (handler) => {
      worker = new Worker(
        'oracle-analysis',
        async (job) => handler(job.data),
        { connection, concurrency: config.queueConcurrency }
      );
      worker.on('failed', async (job, err) => {
        await logger.log('error', 'Queue job failed', { jobId: job?.id, error: err.message });
      });
    },
    count: () => queue.count(),
    close: async () => {
      if (worker) await worker.close();
      await queue.close();
      await connection.quit();
    }
  };
}
