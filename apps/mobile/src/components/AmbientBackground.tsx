import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/** Soft ambient lighting behind glass surfaces. Static SVG — zero per-frame cost. */
export const AmbientBackground = memo(function AmbientBackground({ intensity = 1 }: { intensity?: number }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="a" cx="15%" cy="8%" rx="75%" ry="45%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.16 * intensity} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="b" cx="100%" cy="42%" rx="70%" ry="40%">
            <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.09 * intensity} />
            <Stop offset="1" stopColor={colors.cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="c" cx="30%" cy="105%" rx="80%" ry="35%">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.07 * intensity} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#a)" />
        <Rect width="100%" height="100%" fill="url(#b)" />
        <Rect width="100%" height="100%" fill="url(#c)" />
      </Svg>
    </View>
  );
});
