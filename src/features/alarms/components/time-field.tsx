import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { pickerDateFor, timeFromPickerDate } from '@/features/alarms/time-picker';
import { useTheme } from '@/hooks/use-theme';

type TimeFieldProps = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
};

/**
 * Native time picker: a SwiftUI wheel on iOS, a Material picker on Android.
 *
 * The picker must get a real width. Its native host only reports its height
 * back to React Native, so in a centred container it collapsed to 0 points
 * wide: the wheel was drawn but iOS delivered no touches to it, and swipes
 * went to the scroll view behind. Stretching it to the full row width fixes it.
 */
export function TimeField({ hour, minute, onChange }: TimeFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <DateTimePicker
        mode="time"
        // iOS: wheel. Android: Material clock dial ('spinner' would be a text input there).
        display={process.env.EXPO_OS === 'ios' ? 'spinner' : 'default'}
        presentation="inline"
        is24Hour
        value={pickerDateFor(hour, minute)}
        accentColor={theme.tint}
        onValueChange={(_event, date) => {
          const next = timeFromPickerDate(date);
          if (next.hour !== hour || next.minute !== minute) onChange(next.hour, next.minute);
        }}
        style={styles.picker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.two,
  },
  picker: {
    // A definite width so the native wheel is hit-testable (see the comment above).
    width: '100%',
    alignSelf: 'stretch',
  },
});
