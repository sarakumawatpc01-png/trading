const DEFAULT_TICK_INTERVAL_MS = 1000;
// A wall disappearing within this short window is treated as potential spoof behavior.
// 8 seconds approximates short-lived liquidity baiting in this simulated intraday stream.
const WALL_SPOOF_WINDOW_MS = 8000;
// Minimum aggregated top-level quantity to classify as a meaningful liquidity wall.
const SPOOF_WALL_MIN_QTY = 100000;

export class TickStreamService {
  constructor({ store, broadcaster, logger }) {
    this.store = store;
    this.broadcaster = broadcaster;
    this.logger = logger;
    this.timer = null;
    this.stateBySymbol = new Map();
    this.lastWallBySymbol = new Map();
  }

  async start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.emitCycle().catch(() => {});
    }, DEFAULT_TICK_INTERVAL_MS);
    await this.logger.log('info', 'Tick stream started', { mode: 'mock' });
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async emitCycle() {
    const stocks = await this.store.listStocks();
    const symbols = Array.from(new Set(['NIFTY.NS', 'BANKNIFTY.NS', ...stocks.map((row) => row.symbol)]));
    const now = Date.now();
    for (const symbol of symbols) {
      const tick = this.buildTick(symbol, now);
      const row = await this.store.addTick(tick);
      this.broadcaster.broadcast('tick', row);
      this.broadcaster.broadcast(`tick:${symbol}`, row);
      this.broadcaster.broadcast(`orderbook:${symbol}`, await this.store.getOrderBook(symbol));
      this.broadcaster.broadcast(`delta:${symbol}`, await this.store.getDeltaSeries(symbol, 50));
    }
  }

  buildTick(symbol, nowMs) {
    const previous = this.stateBySymbol.get(symbol) || {
      lastPrice: symbol.includes('BANKNIFTY') ? 48000 : 22000,
      cumulativeDelta: 0
    };
    const drift = Math.sin(nowMs / 30000) * 2;
    const noise = (Math.random() - 0.5) * 6;
    const lastPrice = Number((previous.lastPrice + drift + noise).toFixed(2));
    const spread = Number((0.4 + Math.random() * 1.2).toFixed(2));
    const bestBid = Number((lastPrice - spread / 2).toFixed(2));
    const bestAsk = Number((lastPrice + spread / 2).toFixed(2));
    const bidDepth = this.generateDepth(bestBid, 'buy');
    const askDepth = this.generateDepth(bestAsk, 'sell');
    const bidTotal = bidDepth.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const askTotal = askDepth.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const imbalanceRatio = askTotal ? Number((bidTotal / askTotal).toFixed(3)) : 0;
    const delta = Math.round((bidTotal - askTotal) / 15);
    const cumulativeDelta = Number((previous.cumulativeDelta + delta).toFixed(2));
    const priceMove = lastPrice - previous.lastPrice;
    const hasMeaningfulPriceMove = Math.abs(priceMove) > 0.01;
    const hasMeaningfulDeltaMove = Math.abs(delta) > 10;
    const divergence = hasMeaningfulPriceMove && hasMeaningfulDeltaMove && (Math.sign(priceMove) !== Math.sign(delta));
    const wall = this.detectWall(bidDepth, askDepth);
    const spoofAlert = this.detectSpoof(symbol, wall, nowMs);
    const ticksPerSec = 1;

    const tick = {
      symbol,
      timestamp: nowMs,
      lastPrice,
      bestBid,
      bestAsk,
      spread,
      depth: { buy: bidDepth, sell: askDepth },
      bidTotal,
      askTotal,
      imbalanceRatio,
      delta,
      cumulativeDelta,
      divergence,
      wall,
      spoofAlert,
      ticksPerSec
    };
    this.stateBySymbol.set(symbol, { lastPrice, cumulativeDelta });
    return tick;
  }

  generateDepth(bestPrice, side) {
    return Array.from({ length: 5 }).map((_, index) => {
      const step = 0.05 * index;
      const price = side === 'buy'
        ? Number((bestPrice - step).toFixed(2))
        : Number((bestPrice + step).toFixed(2));
      const quantity = Math.round(5000 + Math.random() * 80000);
      return {
        price,
        quantity,
        orders: Math.max(1, Math.round(quantity / 7000))
      };
    });
  }

  detectWall(bidDepth, askDepth) {
    const all = [
      ...bidDepth.map((row) => ({ ...row, side: 'buy' })),
      ...askDepth.map((row) => ({ ...row, side: 'sell' }))
    ];
    const top = all.sort((a, b) => b.quantity - a.quantity)[0];
    if (!top || top.quantity < 60000) return null;
    return { side: top.side, price: top.price, quantity: top.quantity };
  }

  detectSpoof(symbol, wall, nowMs) {
    const previous = this.lastWallBySymbol.get(symbol);
    if (wall) {
      this.lastWallBySymbol.set(symbol, { ...wall, seenAt: nowMs });
      return null;
    }
    if (!previous) return null;
    const withinWindow = nowMs - previous.seenAt <= WALL_SPOOF_WINDOW_MS;
    if (withinWindow && previous.quantity >= SPOOF_WALL_MIN_QTY) {
      this.lastWallBySymbol.delete(symbol);
      return {
        detected: true,
        price: previous.price,
        side: previous.side,
        message: `SPOOF DETECTED at ${previous.price}`
      };
    }
    return null;
  }
}
