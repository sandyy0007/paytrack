import type { Loan } from './types';

export interface AggregatedUdhaarPerson {
  identityKey: string;
  displayName: string;
  upiId: string | null;
  contact: string | null;
  loans: Loan[];
  totalLentOriginalPaise: number;
  totalLentPendingPaise: number;
  totalLentRepaidPaise: number;
  totalBorrowedOriginalPaise: number;
  totalBorrowedPendingPaise: number;
  totalBorrowedRepaidPaise: number;
  netPendingPaise: number; // > 0: Receivable (User lent more), < 0: Payable (User borrowed more), 0: Settled
  activeCount: number;
  settledCount: number;
  hasActive: boolean;
  latestDate: string;
}

export function normalizePersonName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeUpiId(contact: string | null | undefined): string | null {
  if (!contact) return null;
  const trimmed = contact.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  return null;
}

export function getUdhaarIdentityKey(personName: string, personContact?: string | null): string {
  const upi = normalizeUpiId(personContact);
  const normName = normalizePersonName(personName);
  if (upi) {
    return `upi:${upi}:${normName}`;
  }
  return `name:${normName}`;
}

export function aggregateUdhaarLoans(loans: Loan[]): AggregatedUdhaarPerson[] {
  const groups = new Map<string, Loan[]>();

  for (const loan of loans) {
    const key = getUdhaarIdentityKey(loan.personName, loan.personContact);
    const existing = groups.get(key);
    if (existing) {
      existing.push(loan);
    } else {
      groups.set(key, [loan]);
    }
  }

  const result: AggregatedUdhaarPerson[] = [];

  for (const [identityKey, groupLoans] of groups.entries()) {
    if (groupLoans.length === 0) continue;
    // Sort loans inside group by created_at desc
    groupLoans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const latest = groupLoans[0]!;
    const upiId = groupLoans.map((l) => normalizeUpiId(l.personContact)).find(Boolean) ?? null;
    const contact = groupLoans.map((l) => l.personContact?.trim()).find((c) => !!c && !c.includes('@')) ?? null;
    const displayName = latest.personName.trim();

    let totalLentOriginalPaise = 0;
    let totalLentPendingPaise = 0;
    let totalLentRepaidPaise = 0;
    let totalBorrowedOriginalPaise = 0;
    let totalBorrowedPendingPaise = 0;
    let totalBorrowedRepaidPaise = 0;
    let activeCount = 0;
    let settledCount = 0;

    for (const loan of groupLoans) {
      const isSettled = loan.status === 'SETTLED' || loan.status === 'CANCELLED';
      if (isSettled) {
        settledCount++;
      } else {
        activeCount++;
      }

      if (loan.direction === 'LENT') {
        totalLentOriginalPaise += loan.originalAmountPaise;
        totalLentPendingPaise += isSettled ? 0 : loan.remainingAmountPaise;
        totalLentRepaidPaise += loan.repaidAmountPaise;
      } else if (loan.direction === 'BORROWED') {
        totalBorrowedOriginalPaise += loan.originalAmountPaise;
        totalBorrowedPendingPaise += isSettled ? 0 : loan.remainingAmountPaise;
        totalBorrowedRepaidPaise += loan.repaidAmountPaise;
      }
    }

    const netPendingPaise = totalLentPendingPaise - totalBorrowedPendingPaise;
    const hasActive = activeCount > 0;

    result.push({
      identityKey,
      displayName,
      upiId,
      contact,
      loans: groupLoans,
      totalLentOriginalPaise,
      totalLentPendingPaise,
      totalLentRepaidPaise,
      totalBorrowedOriginalPaise,
      totalBorrowedPendingPaise,
      totalBorrowedRepaidPaise,
      netPendingPaise,
      activeCount,
      settledCount,
      hasActive,
      latestDate: latest.createdAt,
    });
  }

  // Sort: Active entities first (ordered by largest absolute net balance or latest date), settled entities last
  result.sort((a, b) => {
    if (a.hasActive && !b.hasActive) return -1;
    if (!a.hasActive && b.hasActive) return 1;
    return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
  });

  return result;
}
