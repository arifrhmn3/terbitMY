import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TimeFieldProps = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
};

/** Native time picker: a SwiftUI wheel on iOS, a Material picker on Android. */
export function TimeField({ hour, minute, onChange }: TimeFieldProps) {
  const theme = useTheme();
  const value = new Date(2000, 0, 1, hour, minute);

  return (
    <View style={styles.container}>
      <DateTimePicker
        mode="time"
        // iOS: wheel. Android: Material clock dial ('spinner' would be a text input there).
        display={process.env.EXPO_OS === 'ios' ? 'spinner' : 'default'}
        presentation="inline"
        is24Hour
        value={value}
        accentColor={theme.tint}
        onValueChange={(_event, date) => onChange(date.getHours(), date.getMinutes())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
