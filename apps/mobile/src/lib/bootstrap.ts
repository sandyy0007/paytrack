import { getDb } from './db';
import { configureNotifications } from './notifications';
import { recoverPaymentSessions } from './paymentSessions';
import { useSession } from './session';
import { useSettings } from './settings';
import { refreshPendingCount, scheduleSync } from './sync';

/** Expense id of an interrupted payment session to resume on launch. */
export let resumeExpenseId: string | null = null;
export const consumeResume = () => {
  const id = resumeExpenseId;
  resumeExpenseId = null;
  return id;
};

export async function bootstrap(): Promise<void> {
  await Promise.all([useSettings.getState().load(), useSession.getState().load(), getDb()]);
  configureNotifications();
  resumeExpenseId = await recoverPaymentSessions();
  await refreshPendingCount();
  scheduleSync(1500);
}
