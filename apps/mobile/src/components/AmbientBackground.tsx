import { memo } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSettings } from '@/lib/settings';
import { colors } from '@/theme/tokens';

/**
 * Universal Ambient Background supporting Dark, Light, and Custom Photo Wallpaper modes.
 * Guaranteed zero flicker, safe fallbacks, and high legibility contrast.
 */
export const AmbientBackground = memo(function AmbientBackground({ intensity = 1 }: { intensity?: number }) {
  const { width, height } = useWindowDimensions();
  const themeMode = useSettings((s) => s.themeMode);
  const customWallpaperUri = useSettings((s) => s.customWallpaperUri);
  const customWallpaperOpacity = useSettings((s) => s.customWallpaperOpacity);
  const customWallpaperBlur = useSettings((s) => s.customWallpaperBlur);
  const customWallpaperOverlay = useSettings((s) => s.customWallpaperOverlay);

  const isLight = themeMode === 'light';
  const isCustom = themeMode === 'custom' && !!customWallpaperUri;

  const bgColor = isLight ? '#F8FAFC' : colors.bg;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} pointerEvents="none">
      {/* Custom Wallpaper Layer */}
      {isCustom ? (
        <>
          <Image
            source={{ uri: customWallpaperUri }}
            style={[
              StyleSheet.absoluteFill,
              {
                width,
                height,
                opacity: Math.max(0.1, Math.min(1, customWallpaperOpacity || 0.4)),
              },
            ]}
            blurRadius={Math.max(0, Math.min(25, customWallpaperBlur || 10))}
            resizeMode="cover"
          />
          {customWallpaperOverlay !== 'none' ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    customWallpaperOverlay === 'light'
                      ? 'rgba(255, 255, 255, 0.45)'
                      : 'rgba(5, 7, 10, 0.72)',
                },
              ]}
            />
          ) : null}
        </>
      ) : null}

      {/* SVG Ambient Glows */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="a" cx="15%" cy="8%" rx="75%" ry="45%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={(isLight ? 0.05 : 0.16) * intensity} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="b" cx="100%" cy="42%" rx="70%" ry="40%">
            <Stop offset="0" stopColor={colors.cyan} stopOpacity={(isLight ? 0.04 : 0.09) * intensity} />
            <Stop offset="1" stopColor={colors.cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="c" cx="30%" cy="105%" rx="80%" ry="35%">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={(isLight ? 0.03 : 0.07) * intensity} />
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
