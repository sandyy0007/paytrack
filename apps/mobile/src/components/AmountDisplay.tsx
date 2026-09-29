import { formatINR } from '@paytrack/shared';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts } from '@/theme/tokens';

const SIZES = { sm: 17, md: 28, lg: 44, xl: 56 } as const;

export function AmountDisplay({ paise, size = 'lg', color = colors.text, style, decimals = 'auto' }: {
  paise: number; size?: keyof typeof SIZES; color?: string; style?: StyleProp<TextStyle>; decimals?: 'auto' | 'always' | 'never';
}) {
  const fs = SIZES[size];
  const txt = formatINR(paise, { symbol: false, decimals });
  return (
    <View style={styles.row} accessible accessibilityLabel={`${formatINR(paise, { decimals })} rupees`}>
      <Text style={[styles.symbol, { fontSize: fs * 0.58, lineHeight: fs * 1.15, color: colors.textSecondary }]}>₹</Text>
      <Text
        style={[{ fontFamily: fonts.extrabold, fontSize: fs, lineHeight: fs * 1.15, letterSpacing: -fs * 0.025, color, fontVariant: ['tabular-nums'] }, style]}
        adjustsFontSizeToFit
        numberOfLines={1}
        minimumFontScale={0.5}
      >
        {txt}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', flexShrink: 1 },
  symbol: { fontFamily: fonts.semibold, marginRight: 2, marginTop: 2 },
});
