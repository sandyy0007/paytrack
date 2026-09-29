/**
 * PayTrack design tokens — single source of truth for colour, type, spacing,
 * radii, elevation and motion. Screens must not hard-code colours.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
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
  display: t(fonts.extrabold, 44, 52, { letterSpacing: -1.2, fontVariant: ['tabular-nums'] }),
  amountXL: t(fonts.extrabold, 56, 64, { letterSpacing: -1.5, fontVariant: ['tabular-nums'] }),
  h1: t(fonts.bold, 28, 34, { letterSpacing: -0.6 }),
  h2: t(fonts.bold, 22, 28, { letterSpacing: -0.3 }),
  h3: t(fonts.semibold, 17, 22),
  body: t(fonts.regular, 15, 22),
  bodyStrong: t(fonts.semibold, 15, 22),
  label: t(fonts.medium, 13, 18, { color: colors.textSecondary }),
  caption: t(fonts.medium, 12, 16, { color: colors.textMuted }),
  overline: t(fonts.semibold, 11, 14, { color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }),
  money: t(fonts.bold, 17, 22, { fontVariant: ['tabular-nums'] }),
  mono: t(Platform.select({ android: 'monospace', ios: 'Menlo', default: 'ui-monospace, Menlo, Consolas, monospace' })!, 14, 20, { letterSpacing: 0.5 }),
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
