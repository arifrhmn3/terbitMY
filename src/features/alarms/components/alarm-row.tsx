import { Link } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  COMPLETION_MODE_LABEL,
  describeMission,
  describeRepeat,
  formatAlarmTime,
  type Alarm,
} from '@/features/alarms/alarm';
import { useTheme } from '@/hooks/use-theme';

type AlarmRowProps = {
  alarm: Alarm;
  onToggle: (enabled: boolean) => void;
};

/** One saved alarm in the list. Tap to edit; the switch turns it on or off. */
export function AlarmRow({ alarm, onToggle }: AlarmRowProps) {
  const theme = useTheme();
  const time = formatAlarmTime(alarm);
  const details = [
    alarm.label,
    describeRepeat(alarm.weekdays),
    describeMission(alarm.mission),
    alarm.mission.type !== 'none' ? COMPLETION_MODE_LABEL[alarm.completionMode] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <Link href={{ pathname: '/alarms/[id]', params: { id: alarm.id } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit alarm ${time}`} style={styles.main}>
          <View style={styles.timeLine}>
            <ThemedText type="title" themeColor={alarm.enabled ? 'text' : 'textSecondary'}>
              {time}
            </ThemedText>
            {alarm.isPrimary && (
              <ThemedText type="caption" themeColor="tint">
                Main wake-up
              </ThemedText>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {details}
          </ThemedText>
        </Pressable>
      </Link>
      <Switch
        accessibilityLabel={`Alarm ${time} on`}
        value={alarm.enabled}
        onValueChange={onToggle}
        trackColor={{ true: theme.tint }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  main: {
    flex: 1,
    gap: Spacing.half,
  },
  timeLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
});
