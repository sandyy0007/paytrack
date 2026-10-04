import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { ScalePressable } from './ScalePressable';
import { haptic } from '@/lib/haptics';
import { useSettings } from '@/lib/settings';
import { colors, radius, space, type } from '@/theme/tokens';

export function PinUnlockOverlay({ onUnlocked }: { onUnlocked: () => void }) {
  const pin = useSettings((s) => s.appLockPin);
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);

  const handlePressNum = (num: string) => {
    if (entered.length >= 4) return;
    const next = entered + num;
    setEntered(next);
    setError(false);
    void haptic.tap();

    if (next.length === 4) {
      if (next === pin) {
        void haptic.success();
        onUnlocked();
      } else {
        void haptic.error();
        setError(true);
        setTimeout(() => setEntered(''), 500);
      }
    }
  };

  const handleDelete = () => {
    if (entered.length > 0) {
      setEntered(entered.slice(0, -1));
      setError(false);
      void haptic.tap();
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={{ alignItems: 'center', marginTop: 60, gap: space.sm }}>
        <View style={styles.lockIconWrap}>
          <Icon name="lock-closed" size={32} color={colors.primary} />
        </View>
        <Text style={type.h2}>PayTrack Locked</Text>
        <Text style={[type.caption, { color: error ? colors.error : colors.textSecondary }]}>
          {error ? 'Incorrect PIN. Try again.' : 'Enter your 4-digit PIN'}
        </Text>

        {/* 4 PIN Dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((idx) => {
            const filled = entered.length > idx;
            return (
              <View
                key={idx}
                style={[
                  styles.dot,
                  filled && styles.dotFilled,
                  error && { borderColor: colors.error, backgroundColor: colors.error },
                ]}
              />
            );
          })}
        </View>
      </View>

      {/* Numpad */}
      <View style={styles.numpad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
          if (!key) return <View key="empty" style={styles.numBtn} />;
          if (key === 'del') {
            return (
              <ScalePressable key="del" onPress={handleDelete} style={styles.numBtn}>
                <Icon name="backspace-outline" size={24} color={colors.text} />
              </ScalePressable>
            );
          }
          return (
            <ScalePressable key={key} onPress={() => handlePressNum(key)} style={styles.numBtn}>
              <Text style={styles.numText}>{key}</Text>
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 99999,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  lockIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 227, 154, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.lg,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.xxl,
    justifyContent: 'space-between',
  },
  numBtn: {
    width: '30%',
    aspectRatio: 1.3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    marginVertical: space.xs,
  },
  numText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
  },
});
