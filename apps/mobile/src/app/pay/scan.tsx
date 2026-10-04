import { parseUpiQr } from '@paytrack/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton, IconButton } from '@/components/Buttons';
import { Icon } from '@/components/Icon';
import { ManualUpiSheet } from '@/components/ManualUpiSheet';
import { QRScannerFrame } from '@/components/QRScannerFrame';
import { Screen } from '@/components/Screen';
import { scanQrFromGallery } from '@/lib/galleryQr';
import { haptic } from '@/lib/haptics';
import { usePayFlow } from '@/lib/payFlow';
import { colors, radius, space, type } from '@/theme/tokens';

export default function Scan() {
  const [perm, requestPerm] = useCameraPermissions();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [manual, setManual] = useState(false);
  const locked = useRef(false);
  const lastBad = useRef<{ data: string; at: number } | null>(null);
  const setPayload = usePayFlow((s) => s.setPayload);
  const size = Math.min(width * 0.72, 300);

  const onScan = useCallback((r: BarcodeScanningResult) => {
    if (locked.current) return;
    // Avoid re-reporting the same invalid code every frame.
    if (lastBad.current && lastBad.current.data === r.data && Date.now() - lastBad.current.at < 2500) return;
    const parsed = parseUpiQr(r.data);
    if (!parsed.ok) {
      lastBad.current = { data: r.data, at: Date.now() };
      void haptic.error();
      setError(parsed.message);
      return;
    }
    locked.current = true;
    setError(null);
    setFound(true);
    void haptic.success();
    setPayload(parsed.payload, parsed.payload.source, r.data);
    setTimeout(() => router.replace('/pay/payee'), 350);
  }, [setPayload]);

  const onPickGallery = async () => {
    setError(null);
    const res = await scanQrFromGallery();
    if (res.ok) {
      void haptic.success();
      setPayload(res.payload, res.payload.source, res.raw);
      router.replace('/pay/payee');
    } else if (!res.canceled) {
      void haptic.error();
      setError(res.error);
    }
  };

  if (!perm) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!perm.granted) {
    return (
      <Screen back title="Scan QR" footer={
        perm.canAskAgain
          ? <PrimaryButton label="Allow camera" icon="camera" onPress={requestPerm} />
          : <PrimaryButton label="Open settings" icon="settings-outline" onPress={() => Linking.openSettings()} />
      }>
        <View style={{ alignItems: 'center', gap: space.lg, marginTop: space.huge }}>
          <View style={styles.permIcon}><Icon name="camera-outline" size={40} color={colors.primary} /></View>
          <Text style={[type.h2, { textAlign: 'center' }]}>Camera needed to scan</Text>
          <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>Camera access is used to scan UPI QR codes for payment preparation. Nothing is recorded or uploaded.</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, width: '100%' }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton label="Gallery Image" variant="ghost" icon="image-outline" onPress={onPickGallery} size="md" />
            </View>
            <View style={{ flex: 1 }}>
              <SecondaryButton label="Enter UPI ID" variant="ghost" icon="at" onPress={() => setManual(true)} size="md" />
            </View>
          </View>
        </View>
        <ManualUpiSheet visible={manual} onClose={() => setManual(false)} />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={found ? undefined : onScan}
      />
      <View style={[StyleSheet.absoluteFill, styles.shade]} pointerEvents="none" />
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <IconButton icon="close" label="Close scanner" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <Text style={type.h3}>Scan QR</Text>
        <IconButton icon={torch ? 'flashlight' : 'flashlight-outline'} label={torch ? 'Turn torch off' : 'Turn torch on'} onPress={() => setTorch((t) => !t)} />
      </View>
      <View style={styles.center} pointerEvents="none">
        <QRScannerFrame size={size} active={!found} success={found} />
        <Animated.Text entering={FadeIn.delay(200)} style={[type.bodyStrong, styles.instruction]}>
          {found ? 'QR read' : "Scan the recipient's UPI QR"}
        </Animated.Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
        {error ? (
          <Animated.View entering={FadeInUp} style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Icon name="alert-circle" size={20} color={colors.error} />
            <Text style={[type.label, { color: colors.text, flex: 1 }]}>{error}</Text>
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <SecondaryButton label="From Gallery" icon="image-outline" onPress={onPickGallery} size="md" />
          </View>
          <View style={{ flex: 1 }}>
            <SecondaryButton label="Enter UPI ID" icon="at" onPress={() => setManual(true)} size="md" />
          </View>
        </View>
      </View>
      <ManualUpiSheet visible={manual} onClose={() => setManual(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  shade: { backgroundColor: 'rgba(0,0,0,0.35)' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxl },
  instruction: { textAlign: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)', overflow: 'hidden' },
  bottom: { position: 'absolute', left: space.xl, right: space.xl, bottom: 0, gap: space.md },
  error: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(40,10,10,0.9)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)' },
  permIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
