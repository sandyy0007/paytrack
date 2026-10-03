import { describe, it, expect } from 'vitest';
import {
  calculateExpenseConfidence,
  reconcilePaymentIntent,
  isUnresolvedPaymentIntent,
} from '../reconciliation';
import { parseReceiptText, matchReceiptWithExpense } from '../receiptParser';
import {
  calculatePaymentDna,
  analyzeRecurringPayee,
  buildMoneyJourney,
  type AnalyticsExpense,
} from '../analytics';
import { matchesQuery, type SearchableExpense } from '../search';
import type { Expense } from '../types';

describe('Phase 2 Master Features', () => {
  describe('Payment Reconciliation Engine & Confidence', () => {
    it('rates 12-digit bank UTR as HIGH confidence', () => {
      const exp: Partial<Expense> = {
        status: 'PAID',
        utr: '427189012345',
        amountPaise: 50000,
        intendedAmountPaise: 50000,
        actualAmountPaise: 50000,
        reconciliationStatus: 'MATCHED',
        paymentMethod: 'UPI',
      };
      const res = calculateExpenseConfidence(exp);
      expect(res.level).toBe('HIGH');
      expect(res.reasons.some((r) => r.includes('12-digit bank UTR'))).toBe(true);
    });

    it('rates payment with transaction reference only as MEDIUM confidence', () => {
      const exp: Partial<Expense> = {
        status: 'PAID',
        transactionReference: 'TXN-ABC-12345',
        amountPaise: 25000,
        intendedAmountPaise: 25000,
        actualAmountPaise: 25000,
        paymentMethod: 'UPI',
      };
      const res = calculateExpenseConfidence(exp);
      expect(res.level).toBe('MEDIUM');
      expect(res.reasons.some((r) => r.includes('Bank 12-digit UTR not yet attached'))).toBe(true);
    });

    it('rates amount mismatch as LOW confidence', () => {
      const exp: Partial<Expense> = {
        status: 'PAID',
        utr: '427189012345',
        amountPaise: 50000,
        intendedAmountPaise: 50000,
        actualAmountPaise: 30000,
        reconciliationStatus: 'AMOUNT_MISMATCH',
        paymentMethod: 'UPI',
      };
      const res = calculateExpenseConfidence(exp);
      expect(res.level).toBe('LOW');
      expect(res.reasons.some((r) => r.includes('Amount mismatch'))).toBe(true);
    });

    it('reconciles payment intent and distinguishes UTR from Txn ID', () => {
      const intent: Expense = {
        id: 'exp-1',
        expenseCode: 'EXP-1',
        userId: 'u1',
        amountPaise: 20000,
        intendedAmountPaise: 20000,
        currency: 'INR',
        payeeName: 'Rohit',
        upiId: 'rohit@okaxis',
        reason: 'Dinner',
        category: 'Food',
        status: 'PENDING_PAYMENT',
        paymentMethod: 'UPI',
        utr: null,
        transactionReference: null,
        paymentApp: null,
        qrSource: 'UPI_URI',
        qrPayload: null,
        notes: null,
        createdAt: new Date().toISOString(),
        expenseDate: new Date().toISOString(),
        paymentInitiatedAt: null,
        paymentCompletedAt: null,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const upiResponse = {
        status: 'SUCCESS' as const,
        txnId: 'TXN-987654',
        txnRef: 'REF-332211',
        approvalRefNo: '428812345678', // 12-digit numeric RRN
        responseCode: '00',
        utr: '428812345678',
        raw: 'status=SUCCESS&approvalRefNo=428812345678&txnId=TXN-987654',
      };

      const result = reconcilePaymentIntent(intent, upiResponse);
      expect(result.reconciliationStatus).toBe('MATCHED');
      expect(result.utr).toBe('428812345678');
      expect(result.transactionId).toBe('TXN-987654');
      expect(result.transactionReference).toBe('REF-332211');
      expect(result.confidenceLevel).toBe('HIGH');
    });

    it('detects amount mismatch during reconciliation without overwriting intended amount', () => {
      const intent: Expense = {
        id: 'exp-2',
        expenseCode: 'EXP-2',
        userId: 'u1',
        amountPaise: 50000,
        intendedAmountPaise: 50000,
        currency: 'INR',
        payeeName: 'Store',
        upiId: 'store@upi',
        reason: 'Supplies',
        category: 'Shopping',
        status: 'USER_RETURNED',
        paymentMethod: 'UPI',
        utr: null,
        transactionReference: null,
        paymentApp: null,
        qrSource: 'UPI_URI',
        qrPayload: null,
        notes: null,
        createdAt: new Date().toISOString(),
        expenseDate: new Date().toISOString(),
        paymentInitiatedAt: null,
        paymentCompletedAt: null,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const result = reconcilePaymentIntent(intent, {
        status: 'SUCCESS',
        txnId: 'TXN-11',
        raw: '',
      }, 45000); // User actually paid 450.00 instead of 500.00

      expect(result.reconciliationStatus).toBe('AMOUNT_MISMATCH');
      expect(result.intendedAmountPaise).toBe(50000);
      expect(result.actualAmountPaise).toBe(45000);
      expect(result.confidenceLevel).toBe('LOW');
    });

    it('detects unresolved payment intents within 24 hours', () => {
      const now = Date.now();
      const recentExpense: Expense = {
        id: 'exp-3',
        expenseCode: 'EXP-3',
        userId: 'u1',
        amountPaise: 10000,
        currency: 'INR',
        payeeName: 'Chai',
        upiId: 'chai@paytm',
        reason: 'Tea',
        category: 'Food',
        status: 'PAYMENT_APP_OPENED',
        paymentMethod: 'UPI',
        utr: null,
        transactionReference: null,
        paymentApp: null,
        qrSource: 'UPI_URI',
        qrPayload: null,
        notes: null,
        createdAt: new Date(now - 15 * 60 * 1000).toISOString(), // 15 mins ago
        expenseDate: new Date(now - 15 * 60 * 1000).toISOString(),
        paymentInitiatedAt: null,
        paymentCompletedAt: null,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      expect(isUnresolvedPaymentIntent(recentExpense, now)).toBe(true);

      // Expired (> 24 hours)
      const ancientExpense: Expense = {
        ...recentExpense,
        createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      };
      expect(isUnresolvedPaymentIntent(ancientExpense, now)).toBe(false);

      // Dismissed
      const dismissedExpense: Expense = {
        ...recentExpense,
        recoveryDismissed: true,
      };
      expect(isUnresolvedPaymentIntent(dismissedExpense, now)).toBe(false);
    });
  });

  describe('Screenshot Intelligence & Receipt Parser', () => {
    it('parses typical payment app receipt text', () => {
      const receiptText = `
        Google Pay
        Paid successfully to
        Rahul Sharma
        rahul.sharma@okaxis
        ₹ 450.00
        UPI transaction ID: CICAgPD_x7-yDA
        Google transaction ID: CICAgPD_x7-yDA
        UPI Ref No. 429188765432
      `;

      const parsed = parseReceiptText(receiptText);
      expect(parsed.status).toBe('SUCCESS');
      expect(parsed.amountPaise).toBe(45000);
      expect(parsed.upiId).toBe('rahul.sharma@okaxis');
      expect(parsed.utr).toBe('429188765432');
    });

    it('matches parsed receipt against an unresolved expense without duplicates', () => {
      const parsed = parseReceiptText(`
        Payment Successful
        To: Sharma Ji Kirana
        sharma@paytm
        ₹1,200.00
        UPI Ref: 429188001122
      `);

      const openExpense: Expense = {
        id: 'exp-kirana',
        expenseCode: 'EXP-10',
        userId: 'u1',
        amountPaise: 120000,
        intendedAmountPaise: 120000,
        currency: 'INR',
        payeeName: 'Sharma Ji Kirana',
        upiId: 'sharma@paytm',
        reason: 'Groceries',
        category: 'Groceries',
        status: 'PAYMENT_APP_OPENED',
        paymentMethod: 'UPI',
        utr: null,
        transactionReference: null,
        paymentApp: null,
        qrSource: 'UPI_URI',
        qrPayload: null,
        notes: null,
        createdAt: new Date().toISOString(),
        expenseDate: new Date().toISOString(),
        paymentInitiatedAt: null,
        paymentCompletedAt: null,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const match = matchReceiptWithExpense(parsed, openExpense);
      expect(match.isProbableMatch).toBe(true);
      expect(match.score).toBeGreaterThanOrEqual(80);
      expect(match.matchReasons.some((r) => r.includes('Amount matches'))).toBe(true);
      expect(match.matchReasons.some((r) => r.includes('Payee UPI ID'))).toBe(true);
    });
  });

  describe('Payment DNA & Recurring Payee Intelligence', () => {
    const expenses: AnalyticsExpense[] = [
      {
        amountPaise: 10000, // ₹100 (small)
        status: 'PAID',
        category: 'Food',
        payeeName: 'Chai Point',
        upiId: 'chaipoint@icici',
        expenseDate: '2026-09-01T10:00:00.000Z',
        reason: 'Morning tea',
      },
      {
        amountPaise: 12000, // ₹120 (small)
        status: 'PAID',
        category: 'Food',
        payeeName: 'Chai Point',
        upiId: 'chaipoint@icici',
        expenseDate: '2026-09-08T10:00:00.000Z',
        reason: 'Morning tea',
      },
      {
        amountPaise: 15000, // ₹150 (small)
        status: 'PAID',
        category: 'Food',
        payeeName: 'Chai Point',
        upiId: 'chaipoint@icici',
        expenseDate: '2026-09-15T10:00:00.000Z',
        reason: 'Morning tea',
      },
      {
        amountPaise: 500000, // ₹5000 (large)
        status: 'PAID',
        category: 'Housing',
        payeeName: 'Landlord',
        upiId: 'landlord@upi',
        expenseDate: '2026-09-01T12:00:00.000Z',
        reason: 'House rent',
      },
      {
        amountPaise: 99999, // Unconfirmed should NOT count in spending DNA
        status: 'PENDING_PAYMENT',
        category: 'Other',
        payeeName: 'Pending Payee',
        upiId: 'pending@upi',
        expenseDate: '2026-09-10T12:00:00.000Z',
      },
    ];

    it('calculates private payment DNA strictly from PAID transactions', () => {
      const dna = calculatePaymentDna(expenses);
      expect(dna.totalPaidCount).toBe(4);
      expect(dna.largestPaymentPaise).toBe(500000);
      expect(dna.smallPaymentsCount).toBe(3); // ₹100, ₹120, ₹150
      expect(dna.largePaymentsCount).toBe(1); // ₹5000
      expect(dna.mostFrequentPayee?.name).toBe('Chai Point');
      expect(dna.mostFrequentCategory?.name).toBe('Food');
    });

    it('detects recurring payee pattern and intervals', () => {
      const info = analyzeRecurringPayee(expenses, 'chaipoint@icici');
      expect(info).not.toBeNull();
      expect(info?.count).toBe(3);
      expect(info?.averageIntervalDays).toBe(7);
      expect(info?.intervalDescription).toContain('Weekly');
      expect(info?.commonPurpose).toBe('Morning tea');
      expect(info?.isRecurring).toBe(true);
    });

    it('builds interactive money journey steps', () => {
      const journey = buildMoneyJourney(expenses);
      expect(journey.length).toBe(4);
      expect(journey[0]!.payeeName).toBe('Chai Point');
      expect(journey[journey.length - 1]!.amountPaise).toBe(15000);
    });
  });

  describe('Advanced Search & Modes', () => {
    const item: SearchableExpense = {
      amountPaise: 185000,
      payeeName: 'Delhi Metro Rail',
      upiId: 'dmrc@icici',
      reason: 'Monthly smart card recharge',
      category: 'Travel',
      utr: '429100998877',
      transactionReference: 'DMRC-TXN-4422',
      transactionId: 'METRO9901',
      expenseCode: 'EXP-20260928-0099',
      expenseDate: '2026-09-18T14:30:00.000Z',
      status: 'PAID',
      mode: 'College',
    };

    it('matches by mode, status, transaction ID, UTR, and keywords', () => {
      expect(matchesQuery(item, 'College')).toBe(true);
      expect(matchesQuery(item, 'METRO9901')).toBe(true);
      expect(matchesQuery(item, '429100998877')).toBe(true);
      expect(matchesQuery(item, 'DMRC-TXN-4422')).toBe(true);
      expect(matchesQuery(item, '₹1,850')).toBe(true);
      expect(matchesQuery(item, 'sep')).toBe(true);
      expect(matchesQuery(item, 'Personal')).toBe(false);
    });
  });
});

