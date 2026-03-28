import { uid } from '../utils/id.js';

export class PipelineService {
  constructor({ store, queue, logger, agents, brain, broadcaster }) {
    this.store = store;
    this.queue = queue;
    this.logger = logger;
    this.agents = agents;
    this.brain = brain;
    this.broadcaster = broadcaster;
  }

  async enqueueAnalysis(trigger) {
    const runId = uid('run');
    await this.queue.add({ runId, trigger, requestedAt: Date.now() });
    await this.logger.log('info', 'Analysis enqueued', { runId, symbol: trigger.symbol });
    return { runId };
  }

  startWorker() {
    this.queue.process(async ({ runId, trigger }) => {
      const started = Date.now();
      try {
        await this.logger.log('info', 'Pipeline started', { runId, symbol: trigger.symbol });

        const agentOutputs = await this.agents.runAll({
          symbol: trigger.symbol,
          context: trigger,
          runId
        });

        const result = await this.brain.decide({
          symbol: trigger.symbol,
          runId,
          agentOutputs,
          triggerContext: trigger
        });

        const setup = await this.store.addSetup(result.setup);
        const signal = await this.store.addSignal({
          symbol: trigger.symbol,
          action: setup.decision,
          reason: setup.rationale
        });

        this.broadcaster.broadcast('setup', setup);
        this.broadcaster.broadcast('signal', signal);

        await this.logger.log('info', 'Pipeline completed', {
          runId,
          symbol: trigger.symbol,
          elapsedMs: Date.now() - started,
          disagreement: result.disagreement,
          avg: result.avg,
          stdev: result.stdev
        });
      } catch (err) {
        await this.logger.log('error', 'Pipeline failed', { runId, error: err.message });
        throw err;
      }
    });
  }
}
