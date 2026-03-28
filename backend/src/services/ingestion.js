import { parse } from 'csv-parse/sync';
import { isIndianMarketOpen } from '../utils/marketHours.js';
import { normalizeIndianSymbol } from '../utils/symbol.js';

export class IngestionService {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
  }

  async ingestNews() {
    if (!isIndianMarketOpen()) return { ingested: 0, skipped: 'outside_market_hours_ist' };
    const symbols = (await this.store.listStocks()).map((s) => s.symbol);
    for (const symbol of symbols) {
      await this.logger.log('info', 'News ingested', { symbol, source: 'mock-news-v1', sentiment: 'neutral' });
    }
    return { ingested: symbols.length };
  }

  async ingestCompanyData() {
    if (!isIndianMarketOpen()) return { ingested: 0, skipped: 'outside_market_hours_ist' };
    const symbols = (await this.store.listStocks()).map((s) => s.symbol);
    for (const symbol of symbols) {
      await this.logger.log('info', 'Company data ingested', { symbol, source: 'mock-company-v1' });
    }
    return { ingested: symbols.length };
  }

  async uploadRows(buffer, format) {
    const text = buffer.toString('utf8');
    let rows;
    if (format === 'csv') {
      rows = parse(text, { columns: true, skip_empty_lines: true });
    } else {
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('JSON upload must be an array');
    }

    let inserted = 0;
    for (const row of rows) {
      if (row.symbol) {
        await this.store.addStock(normalizeIndianSymbol(row.symbol), row);
        inserted++;
      }
    }

    await this.logger.log('info', 'Manual dataset uploaded', { inserted, format });
    return { inserted };
  }
}
