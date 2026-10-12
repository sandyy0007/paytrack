import { describe, it, expect } from 'vitest';
import {
  normalizePersonName,
  normalizeUpiId,
  getUdhaarIdentityKey,
  aggregateUdhaarLoans,
} from '../udhaar';
import type { Loan } from '../types';

describe('Udhaar Module Tests', () => {
  describe('normalizePersonName', () => {
    it('normalizes names by trimming, lowercasing, and removing special characters', () => {
      expect(normalizePersonName('  Ramesh   Kumar! ')).toBe('ramesh kumar');
      expect(normalizePersonName('Dr. A. Sharma #1')).toBe('dr a sharma 1');
      expect(normalizePersonName('')).toBe('');
    });
  });

  describe('normalizeUpiId', () => {
    it('extracts and normalizes valid UPI IDs containing @', () => {
      expect(normalizeUpiId(' Ramesh@okaxis ')).toBe('ramesh@okaxis');
      expect(normalizeUpiId('9876543210')).toBeNull();
      expect(normalizeUpiId(null)).toBeNull();
      expect(normalizeUpiId(undefined)).toBeNull();
    });
  });

  describe('getUdhaarIdentityKey', () => {
    it('generates deterministic upi-based identity key when UPI is present', () => {
      expect(getUdhaarIdentityKey('Ramesh', 'ramesh@upi')).toBe('upi:ramesh@upi:ramesh');
      expect(getUdhaarIdentityKey('Ramesh Kumar', 'ramesh@upi')).toBe('upi:ramesh@upi:ramesh kumar');
    });

    it('generates name-based identity key when no UPI is present', () => {
      expect(getUdhaarIdentityKey('Ramesh Kumar', '9876543210')).toBe('name:ramesh kumar');
      expect(getUdhaarIdentityKey('Ramesh Kumar', null)).toBe('name:ramesh kumar');
    });
  });

  describe('aggregateUdhaarLoans', () => {
    const mockLoans: Loan[] = [
      {
        id: '1',
        personName: 'Ramesh Kumar',
        personContact: 'ramesh@okhdfcbank',
        direction: 'LENT',
        originalAmountPaise: 50000,
        remainingAmountPaise: 20000,
        repaidAmountPaise: 30000,
        status: 'PARTIALLY_REPAID',
        notes: 'Lunch share',
        dueDate: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
      },
      {
        id: '2',
        personName: 'Ramesh Kumar',
        personContact: 'ramesh@okhdfcbank',
        direction: 'LENT',
        originalAmountPaise: 30000,
        remainingAmountPaise: 30000,
        repaidAmountPaise: 0,
        status: 'OPEN',
        notes: 'Groceries',
        dueDate: null,
        createdAt: '2026-03-03T10:00:00.000Z',
        updatedAt: '2026-03-03T10:00:00.000Z',
      },
      {
        id: '3',
        personName: 'Suresh',
        personContact: '9876543210',
        direction: 'BORROWED',
        originalAmountPaise: 15000,
        remainingAmountPaise: 15000,
        repaidAmountPaise: 0,
        status: 'OPEN',
        notes: 'Cab fare',
        dueDate: null,
        createdAt: '2026-03-04T10:00:00.000Z',
        updatedAt: '2026-03-04T10:00:00.000Z',
      },
      {
        id: '4',
        personName: 'Ramesh Kumar',
        personContact: 'ramesh@okhdfcbank',
        direction: 'BORROWED',
        originalAmountPaise: 10000,
        remainingAmountPaise: 10000,
        repaidAmountPaise: 0,
        status: 'OPEN',
        notes: 'Coffee',
        dueDate: null,
        createdAt: '2026-03-05T10:00:00.000Z',
        updatedAt: '2026-03-05T10:00:00.000Z',
      },
    ];

    it('aggregates multiple loans by person identity correctly', () => {
      const result = aggregateUdhaarLoans(mockLoans);
      expect(result).toHaveLength(2);

      const ramesh = result.find((p) => p.displayName === 'Ramesh Kumar');
      expect(ramesh).toBeDefined();
      expect(ramesh?.upiId).toBe('ramesh@okhdfcbank');
      expect(ramesh?.loans).toHaveLength(3);
      // Lent pending: 20000 + 30000 = 50000
      expect(ramesh?.totalLentPendingPaise).toBe(50000);
      // Borrowed pending: 10000
      expect(ramesh?.totalBorrowedPendingPaise).toBe(10000);
      // Net pending: 50000 - 10000 = 40000 (Receivable)
      expect(ramesh?.netPendingPaise).toBe(40000);
      expect(ramesh?.hasActive).toBe(true);

      const suresh = result.find((p) => p.displayName === 'Suresh');
      expect(suresh).toBeDefined();
      expect(suresh?.contact).toBe('9876543210');
      // Borrowed pending: 15000, Net pending: -15000 (Payable)
      expect(suresh?.netPendingPaise).toBe(-15000);
    });

    it('places settled people after active ones', () => {
      const settledLoan: Loan = {
        id: '5',
        personName: 'Settled Person',
        personContact: null,
        direction: 'LENT',
        originalAmountPaise: 20000,
        remainingAmountPaise: 0,
        repaidAmountPaise: 20000,
        status: 'SETTLED',
        notes: 'All paid',
        dueDate: null,
        createdAt: '2026-03-10T10:00:00.000Z', // More recent, but settled
        updatedAt: '2026-03-10T10:00:00.000Z',
      };

      const result = aggregateUdhaarLoans([...mockLoans, settledLoan]);
      expect(result).toHaveLength(3);
      const lastPerson = result[result.length - 1];
      expect(lastPerson).toBeDefined();
      if (lastPerson) {
        expect(lastPerson.displayName).toBe('Settled Person');
        expect(lastPerson.hasActive).toBe(false);
        expect(lastPerson.settledCount).toBe(1);
      }
    });
  });
});
