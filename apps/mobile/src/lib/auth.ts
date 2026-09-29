import { api } from './api';
import { resetLocalData } from './db';
import { useSession, type User } from './session';
import { syncNow } from './sync';

interface AuthResponse { user: User; accessToken: string; refreshToken: string }

export async function login(email: string, password: string) {
  const r = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email: email.trim(), password }, auth: false });
  await useSession.getState().setSession({ mode: 'remote', user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken });
  void syncNow();
}

export async function register(name: string, email: string, password: string, phone?: string) {
  const r = await api<AuthResponse>('/auth/register', {
    method: 'POST', auth: false, body: { name: name.trim(), email: email.trim(), password, ...(phone?.trim() ? { phone: phone.trim() } : {}) },
  });
  await useSession.getState().setSession({ mode: 'remote', user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken });
  void syncNow();
}

export async function continueLocally(name: string) {
  await useSession.getState().setSession({ mode: 'local', user: { name: name.trim() || 'there' } });
}

/** Signs out and removes this account's data from the device. */
export async function logout() {
  const s = useSession.getState().session;
  if (s?.mode === 'remote') {
    await api('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken }, auth: false }).catch(() => undefined);
  }
  await resetLocalData();
  await useSession.getState().clear();
}

export async function deleteAccount() {
  const s = useSession.getState().session;
  if (s?.mode === 'remote') await api('/me', { method: 'DELETE' });
  await resetLocalData();
  await useSession.getState().clear();
}
