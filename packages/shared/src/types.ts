import type { ExpenseStatus, PaymentMethod } from './status';

export type QrSource = 'UPI_URI' | 'BHARAT_QR' | 'MANUAL_UPI' | 'NONE';

export type ExpenseMode = 'Personal' | 'College' | 'Project' | 'Travel' | 'Family' | 'Work';
export const EXPENSE_MODES: readonly ExpenseMode[] = ['Personal', 'College', 'Project', 'Travel', 'Family', 'Work'];

export type FinancialTransactionType = 'EXPENSE' | 'LENT' | 'BORROWED' | 'TRANSFER';
export type LoanDirection = 'LENT' | 'BORROWED';

export interface Loan {
  id: string;
  userId?: string | null;
  personName: string;
  personContact?: string | null;
  direction: LoanDirection; // LENT: Lena Hai (asset), BORROWED: Dena Hai (liability)
  originalAmountPaise: number;
  repaidAmountPaise: number;
  remainingAmountPaise: number;
  status: 'OPEN' | 'PARTIALLY_REPAID' | 'SETTLED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  notes?: string | null;
  linkedTransactionId?: string | null;
  createdFromPaymentId?: string | null;
}

export interface Goal {
  id: string;
  name: string;
  targetAmountPaise: number;
  savedAmountPaise: number;
  targetDate?: string | null;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  name: string;
  amountPaise: number;
  frequency: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
  nextBillingDate?: string | null;
  category: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReconciliationStatus =
  | 'MATCHED'
  | 'RECONCILED'
  | 'RECONCILED_MANUAL'
  | 'RESPONSE_RECEIVED'
  | 'CONFIRMED_UNRECONCILED'
  | 'UNCONFIRMED'
  | 'AMOUNT_MISMATCH'
  | 'UNRECONCILED';

export type PaymentConfirmationSource = 'AUTO_UPI' | 'USER_CONFIRMED' | 'MANUAL_UTR';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SplitShare {
  id: string;
  personName: string;
  amountPaise: number;
  isPaid: boolean;
  settledAt?: string | null;
}

export interface SplitData {
  totalShares: number;
  shares: SplitShare[];
  notes?: string;
}

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
  transactionId?: string | null;
  approvalReference?: string | null;
  responseCode?: string | null;
  originalQrPayloadHash?: string | null;
  paymentIntentHash?: string | null;
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

  // Master product features: Reconciliation, Intent vs Actual, Confidence, Modes, Splits
  intendedAmountPaise?: number | null;
  actualAmountPaise?: number | null;
  reconciliationStatus?: ReconciliationStatus | null;
  confidenceLevel?: ConfidenceLevel | null;
  confidenceReasons?: string[] | null;
  mode?: ExpenseMode | null;
  splitData?: SplitData | null;
  recoveryDismissed?: boolean | null;
  financialType?: FinancialTransactionType | null;
  paymentConfirmationSource?: PaymentConfirmationSource | null;
  tags?: string[] | null;
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
