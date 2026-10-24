/** Typed client for the separately running RapidRescue Node.js API. */
export interface BackendHealth {
  status: 'ok';
  service: string;
  timestamp: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Backend request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export const backendApi = {
  health: () => request<BackendHealth>('/health'),
  info: () => request<Record<string, unknown>>('/info'),
};
