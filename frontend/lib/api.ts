const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed`);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed`);
  return res.json();
}

const DEFAULT_DEBOUNCE_MS = 500;

type PatchQueue = Record<string, unknown>;

export class DebouncedConfigWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: PatchQueue = {};
  private readonly delayMs: number;

  constructor(delayMs = DEFAULT_DEBOUNCE_MS) {
    this.delayMs = delayMs;
  }

  queue(partial: PatchQueue): Promise<void> {
    this.pending = { ...this.pending, ...partial };
    if (this.timer) clearTimeout(this.timer);
    return new Promise((resolve, reject) => {
      this.timer = setTimeout(async () => {
        try {
          await apiPatch('/admin/config', this.pending);
          this.pending = {};
          resolve();
        } catch (error) {
          reject(error);
        }
      }, this.delayMs);
    });
  }
}
