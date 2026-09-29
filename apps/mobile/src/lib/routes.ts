import type { Href } from 'expo-router';
import type { LocalExpense } from './repo';

/** Where to take the user to finish an incomplete payment record. */
export function resumeHref(e: Pick<LocalExpense, 'id' | 'status'>): Href {
  switch (e.status) {
    case 'PENDING_PAYMENT':
      return { pathname: '/pay/slip', params: { id: e.id } };
    case 'PAYMENT_APP_OPENED':
    case 'USER_RETURNED':
    case 'UNCONFIRMED':
      return { pathname: '/pay/return', params: { id: e.id } };
    case 'PAYMENT_CONFIRMED_BY_USER':
      return { pathname: '/pay/utr', params: { id: e.id } };
    default:
      return { pathname: '/activity/[id]', params: { id: e.id } };
  }
}

export function attentionLabel(e: Pick<LocalExpense, 'status'>): string {
  switch (e.status) {
    case 'PENDING_PAYMENT': return 'Payment pending';
    case 'PAYMENT_APP_OPENED':
    case 'USER_RETURNED': return 'Did this payment go through?';
    case 'UNCONFIRMED': return 'Unconfirmed — tap to resolve';
    case 'PAYMENT_CONFIRMED_BY_USER': return 'UTR missing';
    default: return 'Needs attention';
  }
}
