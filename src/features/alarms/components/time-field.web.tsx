import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatAlarmTime } from '@/features/alarms/alarm';
import { useTheme } from '@/hooks/use-theme';

type TimeFieldProps = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
};

/** Web preview fallback: simple steppers, since there is no native picker. */
export function TimeField({ hour, minute, onChange }: TimeFieldProps) {
  const step = (minutes: number) => {
    const total = (hour * 60 + minute + minutes + 24 * 60) % (24 * 60);
    onChange(Math.floor(total / 60), total % 60);
  };

  return (
    <View style={styles.container}>
      <StepButton label="−1 h" onPress={() => step(-60)} />
      <StepButton label="−5 m" onPress={() => step(-5)} />
      <ThemedText type="title">{formatAlarmTime({ hour, minute })}</ThemedText>
      <StepButton label="+5 m" onPress={() => step(5)} />
      <StepButton label="+1 h" onPress={() => step(60)} />
    </View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.step}>
      <ThemedText type="small" style={{ color: theme.tint }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  step: {
    padding: Spacing.two,
  },
});
