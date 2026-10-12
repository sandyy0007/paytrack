/**
 * PayTrack design tokens — single source of truth for colour, type, spacing,
 * radii, elevation and motion. Screens must not hard-code colours.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { useSettings } from '@/lib/settings';

const baseDarkColors = {
  bg: '#05070A',
  bgElevated: '#0A0E13',
  bgDeep: '#020304',
  surface: 'rgba(255,255,255,0.045)',
  surfaceStrong: 'rgba(255,255,255,0.075)',
  surfacePressed: 'rgba(255,255,255,0.11)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  highlight: 'rgba(255,255,255,0.10)', // top-edge light on glass

  primary: '#10E39A',
  primaryDeep: '#059669',
  primarySoft: 'rgba(16,227,154,0.14)',
  primaryGlow: 'rgba(16,227,154,0.35)',
  onPrimary: '#03140D',

  cyan: '#22D3EE',
  cyanSoft: 'rgba(34,211,238,0.14)',
  blue: '#3B82F6',

  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  error: '#F87171',
  errorSoft: 'rgba(248,113,113,0.14)',
  neutralSoft: 'rgba(156,163,175,0.16)',

  text: '#F5F7FA',
  textSecondary: '#A1ABB9',
  textMuted: '#6B7482',
  textInverse: '#05070A',
} as const;

export type ColorPalette = Record<keyof typeof baseDarkColors, string>;

export const baseLightColors: ColorPalette = {
  bg: '#F8FAFC',
  bgElevated: '#FFFFFF',
  bgDeep: '#F1F5F9',
  surface: 'rgba(15, 23, 42, 0.04)',
  surfaceStrong: 'rgba(15, 23, 42, 0.07)',
  surfacePressed: 'rgba(15, 23, 42, 0.12)',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  highlight: 'rgba(255, 255, 255, 0.60)',

  primary: '#059669',
  primaryDeep: '#047857',
  primarySoft: 'rgba(5, 150, 105, 0.12)',
  primaryGlow: 'rgba(5, 150, 105, 0.25)',
  onPrimary: '#FFFFFF',

  cyan: '#0284C7',
  cyanSoft: 'rgba(2, 132, 199, 0.12)',
  blue: '#2563EB',

  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.12)',
  warning: '#D97706',
  warningSoft: 'rgba(217, 119, 6, 0.12)',
  error: '#DC2626',
  errorSoft: 'rgba(220, 38, 38, 0.12)',
  neutralSoft: 'rgba(100, 116, 139, 0.12)',

  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textInverse: '#F8FAFC',
};

export function getThemeColors(mode?: string): ColorPalette {
  const currentMode = mode ?? useSettings.getState()?.themeMode ?? 'dark';
  return currentMode === 'light' ? baseLightColors : (baseDarkColors as unknown as ColorPalette);
}

export function useThemeColors(): ColorPalette {
  const mode = useSettings((s) => s.themeMode);
  return mode === 'light' ? baseLightColors : (baseDarkColors as unknown as ColorPalette);
}

export function useIsLight(): boolean {
  return useSettings((s) => s.themeMode) === 'light';
}

export const colors: ColorPalette = new Proxy(baseDarkColors, {
  get(target, prop: keyof typeof baseDarkColors) {
    try {
      const mode = useSettings.getState()?.themeMode;
      if (mode === 'light' && prop in baseLightColors) {
        return baseLightColors[prop];
      }
    } catch {
      // safe fallback
    }
    return target[prop];
  },
});

export const gradients = {
  primary: ['#34F5B4', '#10E39A', '#0BB57A'] as const,
  heroCard: ['rgba(16,227,154,0.22)', 'rgba(34,211,238,0.10)', 'rgba(255,255,255,0.03)'] as const,
  glass: ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.03)'] as const,
  ambientA: ['rgba(16,227,154,0.18)', 'rgba(16,227,154,0)'] as const,
  ambientB: ['rgba(34,211,238,0.12)', 'rgba(34,211,238,0)'] as const,
  slip: ['#0E151B', '#0A0F14'] as const,
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, xxl: 32, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

const t = (fontFamily: string, fontSize: number, lineHeight: number, extra: TextStyle = {}): TextStyle => ({
  fontFamily, fontSize, lineHeight, color: colors.text, ...extra,
});

export const type = {
  get display() { return t(fonts.extrabold, 44, 52, { letterSpacing: -1.2, fontVariant: ['tabular-nums'] }); },
  get amountXL() { return t(fonts.extrabold, 56, 64, { letterSpacing: -1.5, fontVariant: ['tabular-nums'] }); },
  get h1() { return t(fonts.bold, 28, 34, { letterSpacing: -0.6 }); },
  get h2() { return t(fonts.bold, 22, 28, { letterSpacing: -0.3 }); },
  get h3() { return t(fonts.semibold, 17, 22); },
  get body() { return t(fonts.regular, 15, 22); },
  get bodyStrong() { return t(fonts.semibold, 15, 22); },
  get label() { return t(fonts.medium, 13, 18, { color: colors.textSecondary }); },
  get caption() { return t(fonts.medium, 12, 16, { color: colors.textMuted }); },
  get overline() { return t(fonts.semibold, 11, 14, { color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }); },
  get money() { return t(fonts.bold, 17, 22, { fontVariant: ['tabular-nums'] }); },
  get mono() { return t(Platform.select({ android: 'monospace', ios: 'Menlo', default: 'ui-monospace, Menlo, Consolas, monospace' })!, 14, 20, { letterSpacing: 0.5 }); },
};

/** Soft layered depth. Android uses elevation + tinted shadow colour. */
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 8,
  } satisfies ViewStyle,
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 14,
  } satisfies ViewStyle,
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 12,
  } satisfies ViewStyle,
  low: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  } satisfies ViewStyle,
};

export const motion = {
  fast: 140,
  base: 220,
  slow: 380,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  pressScale: 0.96,
} as const;

/** Minimum accessible touch target. */
export const HIT = 48;
