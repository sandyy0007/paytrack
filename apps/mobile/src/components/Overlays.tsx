import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, radius, space, type } from '@/theme/tokens';
import { PrimaryButton, SecondaryButton } from './Buttons';

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {visible && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, styles.scrim]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.springify().damping(20)}
            exiting={SlideOutDown.duration(180)}
            style={[
              styles.sheet,
              elevation.floating,
              { paddingBottom: footer ? 0 : Math.max(insets.bottom, 20) + space.lg },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheetContent}
            >
              <View style={styles.handle} />
              {title ? <Text style={[type.h3, { marginBottom: space.md }]} accessibilityRole="header">{title}</Text> : null}
              <View style={styles.bodyWrap}>
                {children}
              </View>
              {footer ? (
                <View style={[styles.footerWrap, { paddingBottom: Math.max(insets.bottom, 24) + space.md }]}>
                  {footer}
                </View>
              ) : null}
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({ visible, title, message, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      {visible && (
        <Animated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, styles.scrim, styles.centerWrap]}>
          <Animated.View entering={ZoomIn.springify().damping(18)} style={[styles.dialog, elevation.floating]} accessibilityViewIsModal>
            <Text style={type.h3} accessibilityRole="header">{title}</Text>
            <Text style={[type.body, { color: colors.textSecondary, marginTop: space.sm }]}>{message}</Text>
            <View style={{ gap: space.sm, marginTop: space.xl }}>
              {destructive ? (
                <SecondaryButton label={confirmLabel} onPress={onConfirm} variant="danger" loading={loading} size="md" />
              ) : (
                <PrimaryButton label={confirmLabel} onPress={onConfirm} loading={loading} size="md" />
              )}
              <SecondaryButton label={cancelLabel} onPress={onCancel} variant="ghost" size="md" />
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl, paddingTop: space.xl, paddingHorizontal: space.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, maxHeight: '88%', overflow: 'hidden',
  },
  sheetContent: {
    flexShrink: 1,
  },
  bodyWrap: {
    flexShrink: 1,
    flexGrow: 0,
  },
  footerWrap: {
    flexShrink: 0,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: colors.bgElevated,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space.lg },
  centerWrap: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: space.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
});
