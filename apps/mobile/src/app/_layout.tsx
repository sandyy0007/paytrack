import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorState } from '@/components/States';
import { bootstrap } from '@/lib/bootstrap';
import { scheduleSync, startSyncListeners } from '@/lib/sync';
import { colors } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    bootstrap()
      .then(() => setReady(true))
      .catch((e) => setBootError(String(e?.message ?? e)));
  }, [attempt]);

  useEffect(() => {
    if (!ready) return;
    const stop = startSyncListeners();
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && scheduleSync(500));
    // Notification tap → open the related expense.
    const notifSub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.expenseId;
      if (typeof id === 'string') router.push({ pathname: '/activity/[id]', params: { id } });
    });
    return () => {
      stop();
      appSub.remove();
      notifSub.remove();
    };
  }, [ready]);

  const done = (fontsLoaded || !!fontError) && (ready || !!bootError);
  useEffect(() => {
    if (done) void SplashScreen.hideAsync().catch(() => undefined);
  }, [done]);

  if (!done) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {bootError ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}>
            <ErrorState title="PayTrack couldn't start" message="Your saved data is safe on this device. Please try again." onRetry={() => { setBootError(null); setAttempt((a) => a + 1); }} />
            <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 11 }}>{bootError}</Text>
          </View>
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
              animationDuration: 260,
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="pay" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="add-expense" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
