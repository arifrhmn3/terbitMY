import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatAlarmTime } from '@/features/alarms/alarm';
import { occurrences, useAlarms } from '@/features/alarms/alarms';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';
import { describeScheduleItem } from '@/features/today/labels';
import { buildWeeklySchedule } from '@/features/today/weekly-schedule';

/**
 * The next seven days of ACTIVE alarms (deleted, turned-off and already-rung
 * one-off alarms never appear), one Main Wake-Up per day at most. Tapping an
 * alarm opens it for editing; mornings and missions live on Today and in Progress.
 */
export default function WeeklyScheduleScreen() {
  const { status, alarms } = useAlarms();
  const { value: access } = useAccessibilitySettings();
  const [today, setToday] = useState<AlarmOccurrence[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      const t = Date.now();
      setNow(t);
      const d = new Date(t);
      occurrences
        .listSince(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())
        .then(setToday)
        .catch(() => setToday([]));
    }, []),
  );

  const days = status === 'ready' ? buildWeeklySchedule({ alarms, now, occurrences: today }) : [];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Weekly schedule', headerLargeTitleEnabled: false }} />
      {days.map((day) => (
        <Section key={day.date} title={day.title}>
          {day.sections.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No alarms
            </ThemedText>
          )}
          {day.sections.flatMap((section) =>
            section.items.map((item) => (
              <ListRow
                key={item.key}
                icon={
                  item.isMainWakeUp
                    ? { ios: 'sunrise.fill', android: 'wb_twilight', web: 'wb_twilight' }
                    : { ios: 'alarm', android: 'alarm', web: 'alarm' }
                }
                title={formatAlarmTime(item)}
                subtitle={describeScheduleItem(item, access.mobilityProfile)}
                href={{ pathname: '/today/alarm/[id]', params: { id: item.alarmId } }}
              />
            )),
          )}
        </Section>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
  },
});
