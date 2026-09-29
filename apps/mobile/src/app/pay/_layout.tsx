import { Stack } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function PayLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right', animationDuration: 240 }} />;
}
