import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, type } from '@/theme/tokens';
import { AmbientBackground } from './AmbientBackground';
import { IconButton } from './Buttons';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  title?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  right?: ReactNode;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  keyboard?: boolean;
}

/** Safe-area aware page shell with ambient background, header and optional sticky footer. */
export function Screen({ children, scroll = true, title, subtitle, back, right, footer, contentStyle, refreshing, onRefresh, bottomInset = 0, keyboard }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const header = (title || back || right) && (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      {back ? (
        <IconButton icon="chevron-back" label="Go back" onPress={typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      ) : (
        <View style={{ width: 4 }} />
      )}
      <View style={styles.titleWrap}>
        {title ? <Text style={type.h3} numberOfLines={1} accessibilityRole="header">{title}</Text> : null}
        {subtitle ? <Text style={type.caption} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
  const pad = { paddingBottom: (footer ? space.lg : insets.bottom + space.xxl) + bottomInset };
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, !header && { paddingTop: insets.top + space.lg }, pad, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.bgElevated} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, !header && { paddingTop: insets.top + space.lg }, pad, contentStyle]}>{children}</View>
  );
  const inner = (
    <>
      {header}
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>{footer}</View> : null}
    </>
  );
  return (
    <View style={styles.root}>
      <AmbientBackground />
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{inner}</KeyboardAvoidingView>
      ) : inner}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.md },
  titleWrap: { flex: 1, alignItems: 'center' },
  right: { minWidth: 48, alignItems: 'flex-end' },
  content: { paddingHorizontal: space.xl, gap: space.lg },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.md },
});
