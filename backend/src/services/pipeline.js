import { uid } from '../utils/id.js';
import { normalizeIndianSymbol } from '../utils/symbol.js';

export class PipelineService {
  constructor({ store, queue, logger, agents, brain, broadcaster, driftMonitor, paperTrader }) {
    this.store = store;
    this.queue = queue;
    this.logger = logger;
    this.agents = agents;
    this.brain = brain;
    this.broadcaster = broadcaster;
    this.driftMonitor = driftMonitor;
    this.paperTrader = paperTrader;
  }

  async enqueueAnalysis(trigger) {
    const runId = uid('run');
    const normalizedTrigger = {
      ...trigger,
      symbol: normalizeIndianSymbol(trigger.symbol),
      triggeredAtMs: Number(trigger?.triggeredAtMs || Date.now())
    };
    await this.queue.add({ runId, trigger: normalizedTrigger, requestedAt: Date.now() });
    await this.logger.log('info', 'Analysis enqueued', { runId, symbol: normalizedTrigger.symbol });
    this.emitActivity({
      runId,
      node: 'PRE-FILTER',
      level: 'info',
      event: 'Analysis enqueued',
      symbol: normalizedTrigger.symbol
    });
    return { runId };
  }

  startWorker() {
    this.queue.process(async ({ runId, trigger }) => {
      const started = Date.now();
      try {
        await this.logger.log('info', 'Pipeline started', { runId, symbol: trigger.symbol });
        this.emitActivity({
          runId,
          node: 'PRE-FILTER',
          level: 'info',
          event: 'Pipeline started',
          symbol: trigger.symbol
        });

        const agentOutputs = await this.agents.runAll({
          symbol: trigger.symbol,
          context: { ...trigger, regime: await this.store.getLatestRegimeForSymbol(trigger.symbol) },
          runId
        });

        const result = await this.brain.decide({
          symbol: trigger.symbol,
          runId,
          agentOutputs,
          triggerContext: trigger
        });
        await this.store.addDecisionAudit({
          runId,
          symbol: trigger.symbol,
          decision: result.setup.decision,
          ev: result.ev,
          avg: Number(result.avg?.toFixed?.(4) ?? result.avg ?? 0),
          stdev: Number(result.stdev?.toFixed?.(4) ?? result.stdev ?? 0),
          disagreement: result.disagreement,
          triggerPrice: trigger.price,
          agentVotes: agentOutputs.map((output) => ({
            agent: output.agent,
            score: output.score,
            bias: output.payload?.bias || null
          }))
        });

        const setup = await this.store.addSetup(result.setup);
        this.emitActivity({
          runId,
          node: 'BRAIN AI',
          level: 'success',
          event: `Brain decision ${setup.decision}`,
          symbol: trigger.symbol
        });
        const signal = await this.store.addSignal({
          symbol: trigger.symbol,
          action: setup.decision,
          reason: setup.rationale
        });
        const config = await this.store.getConfig();
        const paperMode = Boolean(trigger?.paperMode || config.paperModeEnabled);
        let paperTrade = null;
        if (paperMode && setup.decision === 'TAKE' && this.paperTrader) {
          paperTrade = await this.paperTrader.openFromSetup(setup, 1);
        }
        if (this.driftMonitor) {
          await this.driftMonitor.autoReweightIfNeeded(trigger.symbol);
        }

        this.broadcaster.broadcast('setup', setup);
        this.broadcaster.broadcast('signal', signal);
        if (paperTrade) this.broadcaster.broadcast('paper-trade', paperTrade);
        this.emitActivity({
          runId,
          node: 'GRAND SYNTHESIS',
          level: 'success',
          event: `Signal ${signal.action} generated`,
          symbol: trigger.symbol
        });

        await this.logger.log('info', 'Pipeline completed', {
          runId,
          symbol: trigger.symbol,
          elapsedMs: Date.now() - started,
          disagreement: result.disagreement,
          avg: result.avg,
          stdev: result.stdev,
          ev: result.ev
        });
        this.emitActivity({
          runId,
          node: 'TELEGRAM',
          level: 'success',
          event: 'Pipeline completed',
          symbol: trigger.symbol
        });
      } catch (err) {
        await this.logger.log('error', 'Pipeline failed', { runId, error: err.message });
        this.emitActivity({
          runId,
          node: 'PIPELINE',
          level: 'error',
          event: `Pipeline failed: ${err.message}`,
          symbol: trigger.symbol
        });
        throw err;
      }
    });
  }

  emitActivity(payload) {
    this.broadcaster.broadcast('pipeline:activity', {
      ...payload,
      timestamp: Date.now()
    });
  }
}
