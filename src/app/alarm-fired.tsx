import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { handOff, occurrences } from '@/features/alarms/alarms';
import { markAlarmPresented } from '@/features/alarms/use-alarm-handoff';

/**
 * Opened by Android's native alarm screen ("Start mission"):
 * terbitmy://alarm-fired?alarmId=…&fireAt=…&start=1
 * Records the fire, then opens that morning's alarm screen (straight into the
 * mission when `start=1`).
 */
export default function AlarmFiredRoute() {
  const theme = useTheme();
  const { alarmId, fireAt, start } = useLocalSearchParams<{ alarmId?: string; fireAt?: string; start?: string }>();

  useEffect(() => {
    let active = true;
    (async () => {
      await handOff.sync().catch(() => null);
      const scheduledAt = Number(fireAt);
      let occurrence =
        alarmId && Number.isFinite(scheduledAt) ? await occurrences.findForEvent(alarmId, scheduledAt) : null;
      if (occurrence && start === '1' && occurrence.status === 'alarm_fired' && occurrence.mission.type !== 'none') {
        occurrence = await occurrences.startMission(occurrence.id).catch(() => occurrence);
      }
      if (!active) return;
      if (occurrence) {
        markAlarmPresented(occurrence.id);
        router.replace({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: occurrence.id } });
      } else {
        router.replace('/alarms');
      }
    })();
    return () => {
      active = false;
    };
  }, [alarmId, fireAt, start]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText themeColor="textSecondary">Opening your alarm…</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
