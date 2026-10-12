import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { UpiAppPicker } from '@/components/UpiAppPicker';
import { copyText } from '@/lib/clipboard';
import { haptic } from '@/lib/haptics';
import { cancelPendingReminder, schedulePendingReminder } from '@/lib/notifications';
import { buildUpiDiagnostics, maskUpiUriForLogging } from '@paytrack/shared';
import { buildUriForExpense, extractRawQrPayload, getLaunchUri, run } from '@/lib/payActions';
import { getExpense, recordFailedPayment, saveSuccessfulPayment, transition, type LocalExpense } from '@/lib/repo';
import { useSettings } from '@/lib/settings';
import { appNameForPackage, launchUpiPayment } from '@/lib/upiLaunch';
import { colors, radius, space, type } from '@/theme/tokens';

type Phase = { kind: 'launching' } | { kind: 'failed'; message: string; expense: LocalExpense } | { kind: 'error'; message: string };

export default function Redirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [phase, setPhase] = useState<Phase>({ kind: 'launching' });
  const [picker, setPicker] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const started = useRef(-1);
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1);
  }, [spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    (async () => {
      const e = await getExpense(id);
      if (!e) return setPhase({ kind: 'error', message: 'This expense no longer exists.' });
      const { preferredUpiPackage, shareNoteWithPayee } = useSettings.getState();
      let uri: string;
      try {
        uri = getLaunchUri(e, shareNoteWithPayee);
      } catch (err) {
        return setPhase({ kind: 'error', message: (err as Error).message });
      }

      const raw = extractRawQrPayload(e);
      const preReport = buildUpiDiagnostics(raw, uri, { packageName: preferredUpiPackage });
      if (__DEV__) {
        console.log('[UPI_DIAGNOSTICS] Report:', JSON.stringify(preReport, null, 2));
      }

      const appName = appNameForPackage(preferredUpiPackage) ?? 'UPI app';
      // Record the hand-off first so an app kill mid-payment is recoverable.
      if (e.status !== 'PAYMENT_APP_OPENED') {
        await run(() => transition(e.id, 'PAYMENT_APP_OPENED', { paymentApp: appName, meta: { diagnostics: JSON.stringify(preReport) } }));
      }
      void schedulePendingReminder(e.id, e.payeeName ?? e.upiId ?? 'the payee');
      const outcome = await launchUpiPayment(uri, preferredUpiPackage);
      if (!outcome.launched) {
        void haptic.warning();
        void cancelPendingReminder(e.id);
        const back = await run(() => transition(e.id, 'USER_RETURNED', { meta: { launchFailed: true } }));
        return setPhase({ kind: 'failed', message: outcome.message, expense: back });
      }

      // 1. Direct auto-resolution when UPI app returned SUCCESS
      if (outcome.response?.status === 'SUCCESS') {
        void cancelPendingReminder(e.id);
        void haptic.success();
        await run(() => saveSuccessfulPayment(e.id, outcome.response, appName));
        router.replace({ pathname: '/pay/success', params: { id: e.id } });
        return;
      }

      // 2. Direct failure handling when UPI app returned FAILURE
      if (outcome.response?.status === 'FAILURE') {
        void cancelPendingReminder(e.id);
        void haptic.warning();
        await run(() => recordFailedPayment(e.id, outcome.response, appName));
        router.replace({
          pathname: '/pay/failure',
          params: { id: e.id, code: outcome.response.responseCode ?? '' },
        });
        return;
      }

      const postReport = buildUpiDiagnostics(raw, uri, {
        packageName: preferredUpiPackage,
        resultCode: outcome.resultCode,
        responseCode: outcome.response?.responseCode,
        transactionId: outcome.response?.txnId,
        transactionReference: outcome.response?.txnRef,
        approvalReference: outcome.response?.approvalRefNo,
        utr: outcome.response?.utr,
      });
      if (__DEV__) {
        console.log('[UPI_DIAGNOSTICS] Outcome Report:', JSON.stringify(postReport, null, 2));
      }

      // 3. Fallback for foreground return / pending SUBMITTED / unconfirmed
      await run(() => transition(e.id, 'USER_RETURNED', {
        meta: {
          returnedVia: outcome.returnedVia,
          diagnostics: JSON.stringify(postReport),
          ...(outcome.response ? { appReportedStatus: outcome.response.status } : {}),
        },
      }));
      const ref = outcome.response?.approvalRefNo ?? outcome.response?.txnRef ?? outcome.response?.txnId ?? '';
      router.replace({ pathname: '/pay/return', params: { id: e.id, hint: outcome.response?.status ?? '', ref } });
    })().catch((err) => setPhase({ kind: 'error', message: String(err?.message ?? err) }));
  }, [id, attempt]);

  if (phase.kind === 'launching') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Animated.View style={[styles.spinner, spinStyle]} />
          <Text style={type.h2}>Opening your UPI app…</Text>
          <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>Complete the payment there, then come back to PayTrack.</Text>
          <InlineNotice icon="lock-closed-outline" text="Enter your UPI PIN only in your UPI app. PayTrack will never ask for it." />
        </View>
      </Screen>
    );
  }

  if (phase.kind === 'error') {
    return (
      <Screen back={() => router.replace('/home')} title="Payment">
        <InlineNotice tone="error" icon="alert-circle-outline" text={phase.message} />
        <PrimaryButton label="Back to home" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  const e = phase.expense;
  return (
    <Screen back={() => router.replace({ pathname: '/pay/return', params: { id: e.id } })} title="Open UPI app" footer={
      <>
        <PrimaryButton label="Try again" icon="refresh" onPress={() => { setPhase({ kind: 'launching' }); setAttempt((a) => a + 1); }} />
        <SecondaryButton label="Choose a different UPI app" size="md" onPress={() => setPicker(true)} />
        <SecondaryButton label="I paid another way" size="md" variant="ghost" onPress={() => router.replace({ pathname: '/pay/return', params: { id: e.id, manual: '1' } })} />
      </>
    }>
      <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xl }}>
        <View style={styles.warnIcon}><Icon name="apps-outline" size={34} color={colors.warning} /></View>
        <Text style={[type.h2, { textAlign: 'center' }]}>{phase.message}</Text>
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          Install a UPI app such as BHIM, Google Pay, PhonePe or Paytm — or pay manually and record it here.
        </Text>
      </View>
      <View style={styles.manual}>
        <Text style={type.overline}>Pay manually</Text>
        <Text style={type.body}>1. Copy the UPI ID below{'\n'}2. Open any UPI app and pay {e.upiId ? 'this UPI ID' : ''}{'\n'}3. Come back and tap “I paid another way”</Text>
        <SecondaryButton label={copied ? 'Copied' : `Copy ${e.upiId}`} icon={copied ? 'checkmark' : 'copy-outline'} size="md"
          onPress={async () => { await copyText(e.upiId ?? ''); setCopied(true); void haptic.success(); }} />
      </View>
      <UpiAppPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  spinner: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: colors.surfaceStrong, borderTopColor: colors.primary, marginBottom: space.md },
  warnIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft },
  manual: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
