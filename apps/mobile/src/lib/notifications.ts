/**
 * Useful local notifications only: pending payment reminders and budget
 * thresholds. Throttled per budget/period/threshold so users aren't spammed.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { budgetUsage, formatINR, spentInPeriod } from '@paytrack/shared';
import { kvGet, kvSet } from './db';
import { tzOffsetMinutes } from './format';
import { expensesSince, listBudgets } from './repo';
import { useSettings } from './settings';

let configured = false;
export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'PayTrack',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
  }
}

export async function ensurePermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function notify(title: string, body: string) {
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(() => undefined);
}

/** Reminder 20 minutes after handing off to the UPI app, cancelled once resolved. */
export async function schedulePendingReminder(expenseId: string, payee: string) {
  if (!useSettings.getState().notifyPending) return;
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: `pending-${expenseId}`,
    content: { title: 'Payment record pending completion', body: `Confirm whether your payment to ${payee} went through.`, data: { expenseId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 20 * 60 },
  }).catch(() => undefined);
}
export async function cancelPendingReminder(expenseId: string) {
  await Notifications.cancelScheduledNotificationAsync(`pending-${expenseId}`).catch(() => undefined);
}

/** Checks all budgets after a payment is recorded. */
export async function checkBudgetAlerts() {
  if (!useSettings.getState().notifyBudgets) return;
  const budgets = await listBudgets();
  if (!budgets.length) return;
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const expenses = await expensesSince(since);
  const tz = tzOffsetMinutes();
  for (const b of budgets) {
    const spent = spentInPeriod(expenses, b.category, b.period, now, tz);
    const u = budgetUsage(spent, b.amountPaise, b.thresholds);
    if (u.crossedThreshold == null) continue;
    const periodKey = b.period === 'MONTHLY' ? `${now.getFullYear()}-${now.getMonth()}` : `${now.getFullYear()}-w${Math.floor(now.getTime() / (7 * 864e5))}`;
    const key = `notified:${b.id}:${periodKey}`;
    const last = Number((await kvGet(key)) ?? '0');
    if (u.crossedThreshold <= last) continue;
    await kvSet(key, String(u.crossedThreshold));
    const label = b.category === '__ALL__' ? 'Overall' : b.category;
    await notify(
      `${label} budget ${u.crossedThreshold >= 100 ? 'reached' : `${u.crossedThreshold}% used`}`,
      `${formatINR(spent)} of ${formatINR(b.amountPaise)} ${b.period === 'MONTHLY' ? 'this month' : 'this week'}.`,
    );
  }
}
