import type { BottomTabBarProps } from 'expo-router/tabs';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, space } from '@/theme/tokens';
import { FloatingPayButton } from './FloatingPayButton';
import { Icon, type IconName } from './Icon';
import { ScalePressable } from './ScalePressable';

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  home: { label: 'Home', icon: 'home-outline', active: 'home' },
  activity: { label: 'Activity', icon: 'list-outline', active: 'list' },
  analytics: { label: 'Analytics', icon: 'pie-chart-outline', active: 'pie-chart' },
  budgets: { label: 'Budgets', icon: 'wallet-outline', active: 'wallet' },
  profile: { label: 'Profile', icon: 'person-circle-outline', active: 'person-circle' },
};

export const TAB_BAR_HEIGHT = 64;
/** Space screens reserve so content never hides behind the bar + floating PAY button. */
export const TAB_CONTENT_INSET = TAB_BAR_HEIGHT + 88;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
      <View style={styles.fab} pointerEvents="box-none">
        <FloatingPayButton onPress={() => router.push('/pay')} />
      </View>
      <LinearGradient colors={['#0A0E13', '#05070A']} style={StyleSheet.absoluteFill} />
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === i;
          return (
            <ScalePressable
              key={route.key}
              hapticStyle="select"
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <Icon name={focused ? meta.active : meta.icon} size={23} color={focused ? colors.primary : colors.textMuted} />
              <Text style={[styles.label, focused && { color: colors.text }]} numberOfLines={1}>{meta.label}</Text>
              {focused ? <View style={styles.indicator} /> : null}
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  bar: { height: TAB_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: TAB_BAR_HEIGHT, gap: 3 },
  label: { fontFamily: fonts.medium, fontSize: 11, color: colors.textMuted },
  indicator: { position: 'absolute', top: 0, width: 22, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  fab: { position: 'absolute', top: -80, right: space.xl },
});
