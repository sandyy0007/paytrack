import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, space, type } from '@/theme/tokens';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, hint, style, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[styles.input, focused && styles.focused, !!error && styles.errored, style]}
        {...rest}
      />
      {error ? <Text style={[type.caption, { color: colors.error }]} accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text style={type.caption}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: 54, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: fonts.medium, fontSize: 16,
  },
  focused: { borderColor: colors.primary, backgroundColor: colors.surfaceStrong },
  errored: { borderColor: colors.error },
});
