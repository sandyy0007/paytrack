import { secureDelete, secureGet, secureSet } from './secureStorage';
import { create } from 'zustand';

export interface Settings {
  onboarded: boolean;
  /** Android package of the preferred UPI app, or null for the system chooser. */
  preferredUpiPackage: string | null;
  clipboardSuggestions: boolean;
  notifyBudgets: boolean;
  notifyPending: boolean;
  defaultCategory: string | null;
  apiUrlOverride: string | null;
  shareNoteWithPayee: boolean;
}

const DEFAULTS: Settings = {
  onboarded: false,
  preferredUpiPackage: null,
  clipboardSuggestions: true,
  notifyBudgets: true,
  notifyPending: true,
  defaultCategory: null,
  apiUrlOverride: null,
  shareNoteWithPayee: false,
};

const KEY = 'paytrack.settings.v1';

interface SettingsStore extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const raw = await secureGet(KEY);
      set({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}), loaded: true });
    } catch {
      set({ ...DEFAULTS, loaded: true });
    }
  },
  set: async (patch) => {
    set(patch);
    const { loaded: _l, load: _a, set: _b, ...rest } = { ...get(), ...patch };
    await secureSet(KEY, JSON.stringify(rest)).catch(() => undefined);
  },
}));
