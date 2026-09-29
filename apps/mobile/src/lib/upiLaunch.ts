/**
 * Hands the prepared payment to an installed UPI app. PayTrack never executes
 * or verifies the payment — the UPI app/bank does. Launching ≠ paid.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { AppState, Linking, Platform } from 'react-native';
import { KNOWN_UPI_APPS, parseUpiAppResponse, type UpiAppResponse } from '@paytrack/shared';

export type LaunchOutcome =
  | { launched: true; returnedVia: 'result' | 'foreground'; response: UpiAppResponse | null; resultCode: number | null }
  | { launched: false; reason: 'NO_APP' | 'LAUNCH_FAILED'; message: string };

export function appNameForPackage(pkg: string | null | undefined): string | null {
  if (!pkg) return null;
  return KNOWN_UPI_APPS.find((a) => a.packageName === pkg)?.name ?? pkg;
}

function waitForForeground(): { promise: Promise<'foreground'>; cancel: () => void } {
  let sub: { remove: () => void } | null = null;
  let wentBackground = false;
  const promise = new Promise<'foreground'>((resolve) => {
    sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') wentBackground = true;
      else if (s === 'active' && wentBackground) {
        // Give the activity result a moment to arrive first (it carries more info).
        setTimeout(() => resolve('foreground'), 1500);
      }
    });
  });
  return { promise, cancel: () => sub?.remove() };
}

function extractResponse(extra: unknown): UpiAppResponse | null {
  if (!extra || typeof extra !== 'object') return null;
  const e = extra as Record<string, unknown>;
  const raw = typeof e.response === 'string' ? e.response : typeof e.Status === 'string' ? `Status=${e.Status}` : null;
  return parseUpiAppResponse(raw);
}

export async function launchUpiPayment(uri: string, packageName: string | null): Promise<LaunchOutcome> {
  const noApp: LaunchOutcome = { launched: false, reason: 'NO_APP', message: 'No compatible UPI app found.' };

  if (Platform.OS === 'android') {
    const fg = waitForForeground();
    try {
      const activity = IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: uri,
        ...(packageName ? { packageName } : {}),
      }).then((r) => ({ kind: 'result' as const, r }));
      const winner = await Promise.race([activity, fg.promise.then(() => ({ kind: 'foreground' as const }))]);
      if (winner.kind === 'result') {
        return { launched: true, returnedVia: 'result', response: extractResponse(winner.r.extra), resultCode: winner.r.resultCode };
      }
      return { launched: true, returnedVia: 'foreground', response: null, resultCode: null };
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (packageName && /activity|resolve|found|install/i.test(msg)) {
        return { launched: false, reason: 'NO_APP', message: `${appNameForPackage(packageName)} doesn't seem to be installed.` };
      }
      return /activity|resolve|found/i.test(msg) ? noApp : { launched: false, reason: 'LAUNCH_FAILED', message: "Couldn't open the UPI app." };
    } finally {
      fg.cancel();
    }
  }

  // Web preview has no UPI apps to hand off to.
  if (Platform.OS === 'web') return noApp;

  // iOS: open the URL and wait until the user comes back.
  const can = await Linking.canOpenURL(uri).catch(() => false);
  if (!can) return noApp;
  const fg = waitForForeground();
  try {
    await Linking.openURL(uri);
    await fg.promise;
    return { launched: true, returnedVia: 'foreground', response: null, resultCode: null };
  } catch {
    return noApp;
  } finally {
    fg.cancel();
  }
}
