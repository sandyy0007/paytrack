/**
 * Session: either a signed-in account (tokens in SecureStore) or a local-only
 * profile (data stays on the device until the user signs in).
 */
import { secureDelete, secureGet, secureSet } from './secureStorage';
import { create } from 'zustand';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  currency: string;
  defaultCategory: string | null;
  createdAt?: string;
}

export type Session =
  | { mode: 'remote'; user: User; accessToken: string; refreshToken: string }
  | { mode: 'local'; user: { name: string; email?: undefined; phone?: undefined } };

const KEY = 'paytrack.session.v1';

interface SessionStore {
  session: Session | null;
  loaded: boolean;
  expired: boolean;
  load: () => Promise<void>;
  setSession: (s: Session) => Promise<void>;
  updateTokens: (access: string, refresh: string) => Promise<void>;
  updateUser: (u: Partial<User> & { name?: string }) => Promise<void>;
  expire: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useSession = create<SessionStore>((set, get) => ({
  session: null,
  loaded: false,
  expired: false,
  load: async () => {
    try {
      const raw = await secureGet(KEY);
      set({ session: raw ? JSON.parse(raw) : null, loaded: true });
    } catch {
      set({ session: null, loaded: true });
    }
  },
  setSession: async (s) => {
    set({ session: s, expired: false });
    try {
      await secureSet(KEY, JSON.stringify(s));
    } catch (e) {
      // Keep the in-memory session; persistence failure shouldn't block the user.
      console.warn('Could not persist session', e);
    }
  },
  updateTokens: async (accessToken, refreshToken) => {
    const s = get().session;
    if (s?.mode !== 'remote') return;
    await get().setSession({ ...s, accessToken, refreshToken });
  },
  updateUser: async (u) => {
    const s = get().session;
    if (!s) return;
    if (s.mode === 'remote') await get().setSession({ ...s, user: { ...s.user, ...u } });
    else await get().setSession({ ...s, user: { name: u.name ?? s.user.name } });
  },
  /** Refresh token rejected: keep local data, ask the user to sign in again. */
  expire: async () => {
    set({ expired: true });
  },
  clear: async () => {
    set({ session: null, expired: false });
    await secureDelete(KEY).catch(() => undefined);
  },
}));
