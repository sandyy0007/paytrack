import { secureDelete, secureGet, secureSet } from './secureStorage';
import { create } from 'zustand';
import type { ExpenseMode } from '@paytrack/shared';

export type ThemeMode = 'dark' | 'light' | 'custom';

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
  activeMode: ExpenseMode;
  // Theme Engine
  themeMode: ThemeMode;
  customWallpaperUri: string | null;
  customWallpaperOpacity: number;
  customWallpaperBlur: number;
  customWallpaperOverlay: 'dark' | 'light' | 'none';
  // App Lock & Privacy
  appLockEnabled: boolean;
  appLockPin: string | null;
  appLockBiometrics: boolean;
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
  activeMode: 'Personal',
  themeMode: 'dark',
  customWallpaperUri: null,
  customWallpaperOpacity: 0.35,
  customWallpaperBlur: 10,
  customWallpaperOverlay: 'dark',
  appLockEnabled: false,
  appLockPin: null,
  appLockBiometrics: false,
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

