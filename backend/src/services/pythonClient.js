export class PythonClient {
  constructor(config) {
    this.baseUrl = config.pythonServiceUrl;
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) return { status: 'down' };
      return await res.json();
    } catch {
      return { status: 'down' };
    }
  }

  async triggerPrefilter(payload) {
    const res = await fetch(`${this.baseUrl}/prefilter/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Python prefilter failed: ${res.status}`);
    return await res.json();
  }
}
