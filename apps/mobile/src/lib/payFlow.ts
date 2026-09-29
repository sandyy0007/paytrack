/** In-memory state for the pre-slip steps (scan → amount → purpose). */
import { create } from 'zustand';
import type { QrSource, UpiPayload } from '@paytrack/shared';

interface PayFlow {
  payload: UpiPayload | null;
  qrSource: QrSource;
  amountPaise: number | null;
  reason: string;
  category: string | null;
  shareNote: boolean;
  setPayload: (p: UpiPayload, source?: QrSource) => void;
  setAmount: (paise: number) => void;
  setPurpose: (reason: string, category: string, shareNote: boolean) => void;
  reset: () => void;
}

export const usePayFlow = create<PayFlow>((set) => ({
  payload: null,
  qrSource: 'NONE',
  amountPaise: null,
  reason: '',
  category: null,
  shareNote: false,
  setPayload: (payload, source) => set({ payload, qrSource: source ?? payload.source, amountPaise: payload.amountPaise ?? null, reason: '', category: null }),
  setAmount: (amountPaise) => set({ amountPaise }),
  setPurpose: (reason, category, shareNote) => set({ reason, category, shareNote }),
  reset: () => set({ payload: null, qrSource: 'NONE', amountPaise: null, reason: '', category: null, shareNote: false }),
}));
