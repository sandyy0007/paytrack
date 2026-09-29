import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/AmbientBackground';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { useSettings } from '@/lib/settings';
import { colors, radius, space, type } from '@/theme/tokens';

const PAGES: { title: string; body: string; icon: IconName; accent: string }[] = [
  { title: "Your expenses shouldn't require extra work.", body: 'No more remembering payments and typing them in later.', icon: 'sparkles-outline', accent: colors.primary },
  { title: 'Scan. Add purpose. Pay.', body: 'Scan any UPI QR, say what it is for, then pay in the UPI app you already use.', icon: 'scan-outline', accent: colors.cyan },
  { title: 'Your payment becomes your expense record automatically.', body: 'Date, time, payee and UTR — captured as part of paying.', icon: 'receipt-outline', accent: colors.primary },
  { title: 'See where your money actually goes.', body: 'Categories, trends and budgets built from payments you actually made.', icon: 'pie-chart-outline', accent: colors.cyan },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const setSettings = useSettings((s) => s.set);
  const last = index === PAGES.length - 1;

  const finish = async () => {
    await setSettings({ onboarded: true });
    router.replace('/login');
  };
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackground intensity={1.4} />
      <View style={[styles.top, { paddingTop: insets.top + space.lg }]}>
        <Text style={[type.h3, { color: colors.primary }]}>PayTrack</Text>
        {!last ? <Text style={[type.label]} onPress={finish} accessibilityRole="button">Skip</Text> : null}
      </View>
      <FlatList
        ref={list}
        data={PAGES}
        style={{ flex: 1 }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.title}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <View style={{ width, paddingHorizontal: space.xxl, justifyContent: 'center', gap: space.xxl }}>
            <Animated.View entering={FadeInUp.delay(80).duration(500)} style={{ alignItems: 'center' }}>
              <GlassCard variant="hero" padding={space.xxxl} style={{ borderRadius: radius.xxl }}>
                <View style={[styles.orb, { backgroundColor: `${item.accent}22`, borderColor: `${item.accent}66` }]}>
                  <Icon name={item.icon} size={56} color={item.accent} />
                </View>
              </GlassCard>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(160).duration(500)} style={{ gap: space.md }}>
              <Text style={[type.overline, { color: item.accent }]}>{`0${i + 1} / 0${PAGES.length}`}</Text>
              <Text style={type.h1} accessibilityRole="header">{item.title}</Text>
              <Text style={[type.body, { color: colors.textSecondary }]}>{item.body}</Text>
            </Animated.View>
          </View>
        )}
      />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${PAGES.length}`}>
          {PAGES.map((_, i) => <View key={i} style={[styles.dot, i === index && styles.dotOn]} />)}
        </View>
        {last ? (
          <PrimaryButton label="Get Started" icon="arrow-forward" onPress={finish} />
        ) : (
          <SecondaryButton label="Next" icon="arrow-forward" onPress={() => list.current?.scrollToIndex({ index: index + 1 })} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xxl },
  orb: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  bottom: { paddingHorizontal: space.xxl, gap: space.xl },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotOn: { width: 26, backgroundColor: colors.primary },
});
