import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const textColor = primary ? '#FFFFFF' : variant === 'destructive' ? '#FF3B30' : theme.tint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.tint : theme.backgroundElement },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText type="headline" style={{ color: textColor }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  dimmed: {
    opacity: 0.6,
  },
});
