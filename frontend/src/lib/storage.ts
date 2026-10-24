/** The only module that touches localStorage. Wraps data in a versioned envelope and never throws. */
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    const s = window.localStorage;
    const k = '__rr_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

export function readEnvelope<T>(key: string, version: number): T | null {
  try {
    const store = ls();
    const raw = store ? store.getItem(key) : memory.get(key) ?? null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; data?: T };
    if (!parsed || parsed.v !== version || parsed.data === undefined) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeEnvelope<T>(key: string, version: number, data: T): boolean {
  const raw = JSON.stringify({ v: version, data });
  try {
    const store = ls();
    if (store) store.setItem(key, raw);
    else memory.set(key, raw);
    return true;
  } catch {
    memory.set(key, raw);
    return false;
  }
}

export function removeKey(key: string): void {
  memory.delete(key);
  try {
    ls()?.removeItem(key);
  } catch {
    /* ignore */
  }
}
