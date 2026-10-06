import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { toggleWeekday, WEEKDAY_ORDER, WEEKDAY_SHORT, type Weekday } from '@/features/alarms/alarm';
import { useTheme } from '@/hooks/use-theme';

type WeekdayPickerProps = {
  value: Weekday[];
  onChange: (value: Weekday[]) => void;
};

/** Seven round toggles, Monday first. */
export function WeekdayPicker({ value, onChange }: WeekdayPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {WEEKDAY_ORDER.map((day) => {
        const selected = value.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={WEEKDAY_SHORT[day]}
            onPress={() => onChange(toggleWeekday(value, day))}
            style={[styles.day, { backgroundColor: selected ? theme.tint : theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={{ color: selected ? '#FFFFFF' : theme.text }}>
              {WEEKDAY_SHORT[day].charAt(0)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
