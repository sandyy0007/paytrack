import { Redirect, Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';
import { useSession } from '@/lib/session';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const session = useSession((s) => s.session);
  if (!session) return <Redirect href="/login" />;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade' }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="budgets" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
