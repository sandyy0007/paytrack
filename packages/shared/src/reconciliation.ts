import type { Expense, ConfidenceLevel, ReconciliationStatus } from './types'; 
import type { UpiAppResponse } from './upi';

export interface ReconciliationResult {
  reconciliationStatus: ReconciliationStatus;
  actualAmountPaise: number;
  intendedAmountPaise: number;
  utr: string | null;
  transactionId: string | null;
  transactionReference: string | null;
  approvalReference: string | null;
  responseCode: string | null;
  confidenceLevel: ConfidenceLevel;
  confidenceReasons: string[];
}

/**
 * Calculates deterministic confidence level (HIGH / MEDIUM / LOW) and human-readable reasons.
 *
 * HIGH: Verified with 12-digit bank UTR / RRN, or confirmed external UPI app response with matching amount.
 * MEDIUM: User marked paid with transaction reference/ID, or intended amount verified without bank UTR.
 * LOW: Unconfirmed payment, missing transaction reference, or amount mismatch detected.
 */
export function calculateExpenseConfidence(expense: Partial<Expense>): {
  level: ConfidenceLevel;
  reasons: string[];
} {
  const reasons: string[] = [];

  const isPaid = expense.status === 'PAID';
  const hasValidUtr = Boolean(expense.utr && /^[0-9]{12}$/.test(expense.utr));
  const hasApprovalRef = Boolean(expense.approvalReference && expense.approvalReference.trim().length > 0);
  const hasTxnId = Boolean(expense.transactionId && expense.transactionId.trim().length > 0);
  const hasTxnRef = Boolean(expense.transactionReference && expense.transactionReference.trim().length > 0);
  const isMismatch = expense.reconciliationStatus === 'AMOUNT_MISMATCH';

  if (isMismatch) {
    reasons.push('Amount mismatch: Actual paid amount differs from intended expense slip');
    return { level: 'LOW', reasons };
  }

  if (!isPaid) {
    reasons.push('Payment unconfirmed / pending resolution');
    if (!hasValidUtr && !hasTxnRef && !hasTxnId) {
      reasons.push('No transaction reference or UTR recorded');
    }
    return { level: 'LOW', reasons };
  }

  // PAID status checks
  if (hasValidUtr) {
    reasons.push('Verified with 12-digit bank UTR / RRN');
    if (expense.responseCode === '00' || expense.responseCode === '0') {
      reasons.push('UPI network reported successful settlement (code 00)');
    }
    if (expense.reconciliationStatus === 'MATCHED') {
      reasons.push('Intended amount matched external response exactly');
    }
    return { level: 'HIGH', reasons };
  }

  if (hasApprovalRef && (hasTxnId || hasTxnRef)) {
    reasons.push('Confirmed with bank approval reference and transaction ID');
    if (expense.reconciliationStatus === 'MATCHED') {
      reasons.push('Intended amount matched external response');
    }
    return { level: 'HIGH', reasons };
  }

  if (hasTxnId || hasTxnRef) {
    reasons.push('Recorded with UPI transaction reference');
    reasons.push('Bank 12-digit UTR not yet attached');
    return { level: 'MEDIUM', reasons };
  }

  if (expense.paymentMethod === 'CASH' || expense.paymentMethod === 'CARD' || expense.paymentMethod === 'BANK_TRANSFER') {
    reasons.push(`Direct manual entry (${expense.paymentMethod})`);
    return { level: 'MEDIUM', reasons };
  }

  reasons.push('User self-reported as paid without verifiable transaction reference');
  return { level: 'LOW', reasons };
}

/**
 * Deterministically reconciles an intended payment with an external UPI app response.
 * Keeps fields separate: NEVER calls transaction_id or transaction_reference a UTR.
 */
export function reconcilePaymentIntent(
  intent: Expense,
  response: UpiAppResponse | null,
  actualAmountPaiseOverride?: number | null,
): ReconciliationResult {
  const intendedAmountPaise = intent.intendedAmountPaise ?? intent.amountPaise;
  const actualAmountPaise = actualAmountPaiseOverride ?? intendedAmountPaise;

  const transactionId = response?.txnId ?? intent.transactionId ?? null;
  const approvalReference = response?.approvalRefNo ?? intent.approvalReference ?? null;
  const responseCode = response?.responseCode ?? intent.responseCode ?? null;

  // Strict UTR separation: ONLY 12-digit numeric bank reference is a UTR
  let utr = intent.utr ?? null;
  if (!utr && response?.utr && /^[0-9]{12}$/.test(response.utr)) {
    utr = response.utr;
  } else if (!utr && approvalReference && /^[0-9]{12}$/.test(approvalReference)) {
    utr = approvalReference;
  }

  // Transaction reference separation
  let transactionReference = intent.transactionReference ?? null;
  if (!transactionReference && response?.txnRef) {
    transactionReference = response.txnRef;
  } else if (!transactionReference && approvalReference && !utr) {
    transactionReference = approvalReference;
  } else if (!transactionReference && transactionId) {
    transactionReference = transactionId;
  }

  let reconciliationStatus: ReconciliationStatus = 'UNRECONCILED';
  if (response?.status === 'SUCCESS' || intent.status === 'PAID') {
    if (actualAmountPaise !== intendedAmountPaise) {
      reconciliationStatus = 'AMOUNT_MISMATCH';
    } else {
      reconciliationStatus = 'MATCHED';
    }
  }

  const confidence = calculateExpenseConfidence({
    status: response?.status === 'SUCCESS' ? 'PAID' : intent.status,
    utr,
    approvalReference,
    transactionId,
    transactionReference,
    responseCode,
    reconciliationStatus,
    paymentMethod: intent.paymentMethod,
  });

  return {
    reconciliationStatus,
    actualAmountPaise,
    intendedAmountPaise,
    utr,
    transactionId,
    transactionReference,
    approvalReference,
    responseCode,
    confidenceLevel: confidence.level,
    confidenceReasons: confidence.reasons,
  };
}

/**
 * Checks if an expense is an active unresolved payment intent requiring recovery.
 * Recovers payments initiated within the last 24 hours that are not yet terminal.
 */
export function isUnresolvedPaymentIntent(expense: Expense, nowMs: number = Date.now()): boolean {
  if (expense.deletedAt || expense.recoveryDismissed) return false;
  if (expense.status === 'PAID' || expense.status === 'CANCELLED' || expense.status === 'FAILED') return false;

  const createdTime = Date.parse(expense.createdAt || expense.expenseDate);
  if (Number.isNaN(createdTime)) return false;

  // Expire after 24 hours so ancient drafts don't indefinitely clutter the UI
  const ageMs = nowMs - createdTime;
  const isRecent = ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;

  return isRecent;
}

