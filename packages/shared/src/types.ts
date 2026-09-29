import type { ExpenseStatus, PaymentMethod } from './status';

export type QrSource = 'UPI_URI' | 'BHARAT_QR' | 'MANUAL_UPI' | 'NONE';

/** Canonical expense record (camelCase). DB uses snake_case equivalents. */
export interface Expense {
  id: string; // client-generated UUID (idempotent sync key)
  expenseCode: string; // EXP-20260927-0017 (display)
  userId: string | null;
  amountPaise: number;
  currency: 'INR';
  payeeName: string | null;
  upiId: string | null;
  reason: string;
  category: string;
  status: ExpenseStatus;
  paymentMethod: PaymentMethod;
  utr: string | null;
  transactionReference: string | null;
  paymentApp: string | null;
  qrSource: QrSource;
  /** Original QR params (JSON) to rebuild the intent on retry. */
  qrPayload: string | null;
  notes: string | null;
  createdAt: string; // ISO
  expenseDate: string; // ISO — defaults to createdAt; editable
  paymentInitiatedAt: string | null;
  paymentCompletedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseEvent {
  id: string; // UUID
  expenseId: string;
  fromStatus: ExpenseStatus | null;
  toStatus: ExpenseStatus;
  at: string; // ISO
  meta?: Record<string, string | number | boolean | null>;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export type BudgetPeriod = 'WEEKLY' | 'MONTHLY';

export interface Budget {
  id: string;
  category: string; // category name; '__ALL__' for overall
  amountPaise: number;
  period: BudgetPeriod;
  thresholds: number[]; // e.g. [75, 90, 100]
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
