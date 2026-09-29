import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { motion } from '@/theme/tokens';

const APressable = Animated.createAnimatedComponent(Pressable);

export interface ScalePressableProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  hapticStyle?: 'tap' | 'press' | 'select' | 'none';
}

/** Press-scale micro-interaction + optional haptic. */
export function ScalePressable({ children, style, scaleTo = motion.pressScale, hapticStyle = 'tap', onPressIn, onPressOut, onPress, disabled, ...rest }: ScalePressableProps) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        s.value = withTiming(scaleTo, { duration: motion.fast });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, motion.spring);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticStyle !== 'none') void haptic[hapticStyle]();
        onPress?.(e);
      }}
      style={[style, a, disabled ? { opacity: 0.45 } : null]}
    >
      {children}
    </APressable>
  );
}
