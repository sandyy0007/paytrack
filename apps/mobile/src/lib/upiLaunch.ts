/**
 * Hands the prepared payment to an installed UPI app. PayTrack never executes
 * or verifies the payment — the UPI app/bank does. Launching ≠ paid.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { AppState, Linking, Platform } from 'react-native';
import { KNOWN_UPI_APPS, maskUpiUriForLogging, parseUpiAppResponse, type UpiAppResponse } from '@paytrack/shared';

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

function extractResponse(extra: unknown, data?: string | null): UpiAppResponse | null {
  if (data && typeof data === 'string' && data.length > 0) {
    const res = parseUpiAppResponse(data);
    if (res && res.status !== 'UNKNOWN') return res;
  }
  if (extra && typeof extra === 'object') {
    const res = parseUpiAppResponse(extra as Record<string, unknown>);
    if (res && res.status !== 'UNKNOWN') return res;
  }
  if (data && typeof data === 'string' && data.length > 0) {
    return parseUpiAppResponse(data);
  }
  if (extra && typeof extra === 'object') {
    return parseUpiAppResponse(extra as Record<string, unknown>);
  }
  return null;
}

export async function launchUpiPayment(uri: string, packageName: string | null): Promise<LaunchOutcome> {
  const noApp: LaunchOutcome = { launched: false, reason: 'NO_APP', message: 'No compatible UPI app found.' };

  if (__DEV__) {
    console.log('[UPI_LAUNCH] target app:', appNameForPackage(packageName) ?? 'system chooser');
    console.log('[UPI_LAUNCH] final URI:', maskUpiUriForLogging(uri));
  }

  if (Platform.OS === 'android') {
    const fg = waitForForeground();
    try {
      const activity = IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: uri,
        ...(packageName ? { packageName } : {}),
      }).then((r) => ({ kind: 'result' as const, r }));
      const winner = await Promise.race([activity, fg.promise.then(() => ({ kind: 'foreground' as const }))]);
      if (winner.kind === 'result') {
        return {
          launched: true,
          returnedVia: 'result',
          response: extractResponse(winner.r.extra, winner.r.data),
          resultCode: winner.r.resultCode,
        };
      }
      return { launched: true, returnedVia: 'foreground', response: null, resultCode: null };
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (packageName && /activity|resolve|found|install/i.test(msg)) {
        // Fallback: If preferred app is uninstalled or cannot resolve the intent,
        // try the system chooser before declaring failure.
        try {
          const fallbackActivity = IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: uri,
          }).then((r) => ({ kind: 'result' as const, r }));
          const winner = await Promise.race([fallbackActivity, fg.promise.then(() => ({ kind: 'foreground' as const }))]);
          if (winner.kind === 'result') {
            return {
              launched: true,
              returnedVia: 'result',
              response: extractResponse(winner.r.extra, winner.r.data),
              resultCode: winner.r.resultCode,
            };
          }
          return { launched: true, returnedVia: 'foreground', response: null, resultCode: null };
        } catch {
          return { launched: false, reason: 'NO_APP', message: `${appNameForPackage(packageName)} doesn't seem to be installed, and no other UPI app was found.` };
        }
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
