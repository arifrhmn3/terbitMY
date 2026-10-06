import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  createTestOccurrenceId,
  describeNativeState,
  describeNativeStatus,
  describeScheduleResult,
  formatClockTime,
  NATIVE_TEST_ALARM_ID,
  nativeTestFireTime,
} from '@/features/alarms/native-alarm-test';
import { getAlarmService, type NativeAlarmRecord, type NativeAlarmStatus } from '@/services/alarm-scheduler';

/**
 * DEVELOPER TEST TOOL. Schedules one real system alarm (AlarmKit on iPhone,
 * AlarmManager on Android) to prove native alarms work. Not connected to
 * saved alarms or missions.
 */
export function NativeAlarmTest() {
  const [status, setStatus] = useState<NativeAlarmStatus | null>(null);
  const [records, setRecords] = useState<NativeAlarmRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const service = getAlarmService();
    const [nextStatus, list] = await Promise.all([service.getNativeAlarmStatus(), service.listNativeAlarms()]);
    return { nextStatus, list: list.filter((r) => r.alarmId === NATIVE_TEST_ALARM_ID).slice(0, 5) };
  }, []);

  const refresh = useCallback(async () => {
    const { nextStatus, list } = await load();
    setStatus(nextStatus);
    setRecords(list);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().then(({ nextStatus, list }) => {
        if (!active) return;
        setStatus(nextStatus);
        setRecords(list);
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  const service = getAlarmService();
  const available = status?.available ?? false;
  const needsPermission = available && status?.permission !== 'granted';

  return (
    <Section
      title="Native alarm test (developer)"
      footer="Developer test tool. Schedules one real system alarm through AlarmKit (iPhone) or AlarmManager (Android). It isn’t connected to your saved alarms or missions, and the system’s own controls stop it.">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {status ? describeNativeStatus(status) : 'Checking…'}
      </ThemedText>

      {needsPermission && (
        <ListRow
          icon={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }}
          title={status?.permission === 'denied' ? 'Open settings' : 'Allow alarms'}
          onPress={() =>
            run(async () => {
              if (status?.permission === 'denied') {
                await service.openNativeAlarmSettings();
                return 'Opened Settings. Come back here when done.';
              }
              return describeNativeStatus(await service.requestNativeAlarmPermission());
            })
          }
        />
      )}
      {available && (
        <ListRow
          icon={{ ios: 'alarm', android: 'alarm_add', web: 'alarm_add' }}
          title="Schedule test alarm in 2 minutes"
          subtitle="A real system alarm"
          onPress={() =>
            busy
              ? undefined
              : run(async () => {
                  const now = Date.now();
                  const fireAt = nativeTestFireTime(now);
                  const result = await service.scheduleOneTime({
                    alarmId: NATIVE_TEST_ALARM_ID,
                    occurrenceId: createTestOccurrenceId(now),
                    fireAt,
                    title: 'Terbit MY test alarm',
                  });
                  return describeScheduleResult(result, fireAt);
                })
          }
        />
      )}
      {available && (
        <ListRow
          icon={{ ios: 'xmark.circle', android: 'alarm_off', web: 'alarm_off' }}
          title="Cancel test alarm"
          onPress={() =>
            run(async () => {
              await service.cancel(NATIVE_TEST_ALARM_ID);
              return 'Test alarm cancelled.';
            })
          }
        />
      )}
      <ListRow
        icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
        title="Refresh status"
        onPress={() => run(async () => null)}
      />

      {message && (
        <ThemedText type="small" style={styles.text} accessibilityLiveRegion="polite">
          {message}
        </ThemedText>
      )}

      {records.map((record) => (
        <View key={`${record.nativeId}-${record.createdAt}`} style={styles.record}>
          <ThemedText type="smallBold">
            {formatClockTime(record.fireAt)} · {describeNativeState(record.state)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Test ID {record.occurrenceId ?? record.alarmId}
            {record.firedAt ? ` · went off ${formatClockTime(record.firedAt)}` : ''}
            {record.stoppedAt ? ` · stopped ${formatClockTime(record.stoppedAt)}` : ''}
          </ThemedText>
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  text: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  record: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
