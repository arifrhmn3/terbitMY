import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChoiceRowProps<T> = {
  title?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A `Section` row with a native segmented control (UISegmentedControl / Material). */
export function ChoiceRow<T>({ title, options, value, onChange }: ChoiceRowProps<T>) {
  const theme = useTheme();

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
});
