import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';

type ChoiceRowProps<T> = {
  title?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * A `Section` row with a native segmented control (UISegmentedControl /
 * Material). With large text and more than two options, segments would cut
 * their labels short, so it shows a list to pick from instead.
 */
export function ChoiceRow<T>({ title, options, value, onChange }: ChoiceRowProps<T>) {
  const theme = useTheme();
  const largeText = useLargeText();

  if (largeText && options.length > 2) {
    return (
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {title && <ThemedText>{title}</ThemedText>}
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView
                name={
                  selected
                    ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                    : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
                }
                size={22}
                tintColor={theme.tint}
              />
              <ThemedText style={styles.label}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {title && <ThemedText>{title}</ThemedText>}
      <SegmentedControl
        values={options.map((o) => o.label)}
        selectedIndex={Math.max(
          0,
          options.findIndex((o) => o.value === value),
        )}
        tintColor={theme.tint}
        onChange={(event) => {
          const option = options[event.nativeEvent.selectedSegmentIndex];
          if (option) onChange(option.value);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
  },
  label: {
    flex: 1,
  },
});
