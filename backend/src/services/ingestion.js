import { parse } from 'csv-parse/sync';

export class IngestionService {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
  }

  async ingestNews() {
    const symbols = (await this.store.listStocks()).map((s) => s.symbol);
    for (const symbol of symbols) {
      await this.logger.log('info', 'News ingested', { symbol, source: 'mock-news-v1', sentiment: 'neutral' });
    }
    return { ingested: symbols.length };
  }

  async ingestCompanyData() {
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
        await this.store.addStock(String(row.symbol).toUpperCase(), row);
        inserted++;
      }
    }

    await this.logger.log('info', 'Manual dataset uploaded', { inserted, format });
    return { inserted };
  }
}
