import { parseRupeesToPaise } from './money';
import { VPA_RE } from './upi';
import type { Expense } from './types';

export interface ParsedReceipt {
  amountPaise: number | null;
  amountText: string | null;
  payeeName: string | null;
  upiId: string | null;
  utr: string | null;
  transactionId: string | null;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN';
  rawText: string;
}

export interface ReceiptMatchResult {
  score: number; // 0 to 100
  isProbableMatch: boolean;
  matchReasons: string[];
}

/**
 * Extracts structured payment data from raw OCR text of payment screenshots
 * (Google Pay, PhonePe, Paytm, BHIM, etc.).
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const rawText = text || '';
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let amountPaise: number | null = null;
  let amountText: string | null = null;
  let upiId: string | null = null;
  let payeeName: string | null = null;
  let utr: string | null = null;
  let transactionId: string | null = null;
  let status: ParsedReceipt['status'] = 'UNKNOWN';

  // 1. Detect status
  const lower = rawText.toLowerCase();
  if (lower.includes('paid successfully') || lower.includes('payment successful') || lower.includes('transfer successful') || lower.includes('completed')) {
    status = 'SUCCESS';
  } else if (lower.includes('payment failed') || lower.includes('transaction failed') || lower.includes('declined')) {
    status = 'FAILURE';
  } else if (lower.includes('processing') || lower.includes('pending')) {
    status = 'PENDING';
  }

  // 2. Extract Amount: ₹ 1,250.00 or Rs. 500 or INR 500
  const amountRegex = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;
  const amountMatch = rawText.match(amountRegex);
  if (amountMatch && amountMatch[1]) {
    amountText = amountMatch[1].replace(/,/g, '');
    const p = parseRupeesToPaise(amountText);
    if (p.ok) amountPaise = p.paise;
  }

  // 3. Extract UPI ID (VPA)
  for (const line of lines) {
    const words = line.split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/[(),:;]/g, '').trim();
      if (VPA_RE.test(cleanWord)) {
        upiId = cleanWord;
        break;
      }
    }
    if (upiId) break;
  }

  // 4. Extract Payee Name: look for "Paid to <Name>" or "To <Name>" or line before UPI ID
  const paidToMatch = rawText.match(/(?:paid to|to|transfer to)\s+([A-Za-z0-9\s&.'-]{2,40})/i);
  if (paidToMatch && paidToMatch[1]) {
    payeeName = paidToMatch[1].split(/\n|\r/)[0]!.trim();
  }

  // 5. Extract UTR / RRN (12 digits following UTR, UPI Ref, Ref No, RRN)
  const utrMatch = rawText.match(/(?:utr|upi\s*ref(?:erence)?\s*(?:no\.?)?|rrn|ref\s*no\.?)\s*[:#\-]?\s*([0-9]{12})/i);
  if (utrMatch && utrMatch[1]) {
    utr = utrMatch[1];
  } else {
    // Try isolated 12-digit number
    const standalone12 = rawText.match(/\b([0-9]{12})\b/);
    if (standalone12 && standalone12[1]) {
      utr = standalone12[1];
    }
  }

  // 6. Extract Transaction ID (UPI Txn ID or Google Transaction ID)
  const txnMatch = rawText.match(/(?:txn\s*id|transaction\s*id|google\s*transaction\s*id)\s*[:#\-]?\s*([a-zA-Z0-9_\-]{8,40})/i);
  if (txnMatch && txnMatch[1]) {
    transactionId = txnMatch[1].trim();
  }

  return {
    amountPaise,
    amountText,
    payeeName,
    upiId,
    utr,
    transactionId,
    status,
    rawText,
  };
}

/**
 * Matches a parsed screenshot receipt with an existing unresolved or active expense.
 * Prevents duplicate expense creation and supports seamless reconciliation.
 */
export function matchReceiptWithExpense(receipt: ParsedReceipt, expense: Expense): ReceiptMatchResult {
  let score = 0;
  const matchReasons: string[] = [];

  // Match UTR (absolute certainty)
  if (receipt.utr && expense.utr && receipt.utr === expense.utr) {
    score += 100;
    matchReasons.push(`12-digit bank UTR (${receipt.utr}) matches existing record`);
    return { score: 100, isProbableMatch: true, matchReasons };
  }

  // Match Transaction ID
  if (receipt.transactionId && expense.transactionId && receipt.transactionId === expense.transactionId) {
    score += 80;
    matchReasons.push(`Transaction ID (${receipt.transactionId}) matches`);
  }

  // Match Amount (50 points)
  const expenseAmount = expense.intendedAmountPaise ?? expense.amountPaise;
  if (receipt.amountPaise != null && receipt.amountPaise === expenseAmount) {
    score += 50;
    matchReasons.push(`Amount matches exactly (₹${(expenseAmount / 100).toFixed(2)})`);
  }

  // Match UPI ID (30 points)
  if (receipt.upiId && expense.upiId && receipt.upiId.toLowerCase() === expense.upiId.toLowerCase()) {
    score += 30;
    matchReasons.push(`Payee UPI ID (${receipt.upiId}) matches`);
  } else if (receipt.payeeName && expense.payeeName && receipt.payeeName.toLowerCase().includes(expense.payeeName.toLowerCase())) {
    score += 20;
    matchReasons.push(`Payee name (${expense.payeeName}) matches`);
  }

  // Unresolved status bonus: more likely to be the payment we're trying to resolve
  if (expense.status !== 'PAID') {
    score += 10;
    matchReasons.push(`Record is currently pending / awaiting resolution`);
  }

  const isProbableMatch = score >= 60;
  return {
    score: Math.min(score, 100),
    isProbableMatch,
    matchReasons,
  };
}

