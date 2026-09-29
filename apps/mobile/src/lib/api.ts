import Constants from 'expo-constants';
import { useSession } from './session';
import { useSettings } from './settings';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

export function apiBaseUrl(): string {
  const override = useSettings.getState().apiUrlOverride;
  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  return (override || fromConfig || 'http://10.0.2.2:4000').replace(/\/+$/, '');
}

interface Opts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  raw?: boolean;
}

let refreshing: Promise<boolean> | null = null;

async function doFetch(path: string, o: Opts, token?: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 15_000);
  try {
    return await fetch(apiBaseUrl() + path, {
      method: o.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(0, aborted ? 'TIMEOUT' : 'NETWORK', aborted
      ? 'The server took too long to respond.'
      : "Can't reach PayTrack servers. Your data is saved on this device.");
  } finally {
    clearTimeout(timer);
  }
}

async function refreshTokens(): Promise<boolean> {
  const s = useSession.getState().session;
  if (s?.mode !== 'remote') return false;
  const res = await doFetch('/auth/refresh', { method: 'POST', body: { refreshToken: s.refreshToken } });
  if (!res.ok) {
    if (res.status === 401) await useSession.getState().expire();
    return false;
  }
  const j = await res.json();
  await useSession.getState().updateTokens(j.accessToken, j.refreshToken);
  return true;
}

export async function api<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  const needsAuth = o.auth !== false;
  const token = () => {
    const s = useSession.getState().session;
    return s?.mode === 'remote' ? s.accessToken : undefined;
  };
  let res = await doFetch(path, o, needsAuth ? token() : undefined);
  if (res.status === 401 && needsAuth) {
    refreshing ??= refreshTokens().finally(() => (refreshing = null));
    if (await refreshing) res = await doFetch(path, o, token());
  }
  if (res.status === 204) return undefined as T;
  if (o.raw && res.ok) return (await res.text()) as T;
  let body: { error?: { code?: string; message?: string } } | undefined;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'HTTP_' + res.status,
      body?.error?.message ?? (res.status >= 500 ? 'The server had a problem. Please try again.' : 'Request failed.'));
  }
  return body as T;
}
