/**
 * Recovers payment sessions interrupted by the app being killed while the
 * user was in the UPI app. Recent ones are resumed; stale ones are marked
 * UNCONFIRMED (never PAID) so they show up in "needs attention".
 */
import { findOpenPaymentSessions, transition } from './repo';

const RESUME_WINDOW_MS = 30 * 60_000;

export async function recoverPaymentSessions(): Promise<string | null> {
  const open = await findOpenPaymentSessions();
  let resume: string | null = null;
  for (const e of open) {
    const age = Date.now() - Date.parse(e.updatedAt);
    if (age < RESUME_WINDOW_MS && !resume) {
      resume = e.id;
    } else {
      await transition(e.id, 'UNCONFIRMED', { meta: { reason: 'no_confirmation' } }).catch(() => undefined);
    }
  }
  return resume;
}
