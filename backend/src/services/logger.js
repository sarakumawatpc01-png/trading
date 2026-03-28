export class Logger {
  constructor(storage, broadcaster) {
    this.storage = storage;
    this.broadcaster = broadcaster;
  }

  async log(level, message, context = {}) {
    const entry = await this.storage.addLog({ level, message, context });
    this.broadcaster.broadcast('log', entry);
    return entry;
  }
}
