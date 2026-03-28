export class Broadcaster {
  constructor() {
    this.clients = new Set();
  }

  register(ws) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload, ts: Date.now() });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }
}
