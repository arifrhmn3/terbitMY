import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { createAlarmDraft, formatAlarmTime } from '@/features/alarms/alarm';
import { alarmStore } from '@/features/alarms/alarms';
import {
  createTestOccurrenceId,
  describeNativeState,
  describeNativeStatus,
  describeScheduleResult,
  formatClockTime,
  NATIVE_TEST_ALARM_ID,
  nativeTestFireTime,
  SAVED_FLOW_TEST_LABEL,
  savedFlowTestTime,
} from '@/features/alarms/native-alarm-test';
import {
  getAlarmService,
  type NativeAlarmActionRecord,
  type NativeAlarmRecord,
  type NativeAlarmStatus,
} from '@/services/alarm-scheduler';

type Snapshot = { status: NativeAlarmStatus; records: NativeAlarmRecord[]; actions: NativeAlarmActionRecord[] };

/**
 * DEVELOPER DIAGNOSTICS (development builds only). Runs the real saved-alarm
 * flow two minutes ahead, shows exactly how each native alarm was set up
 * (Terbit button, presentation, state) and the button taps iOS recorded.
 */
export function NativeAlarmTest() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<Snapshot> => {
    const service = getAlarmService();
    const [status, records, actions] = await Promise.all([
      service.getNativeAlarmStatus(),
      service.listNativeAlarms(),
      service.listNativeActions(),
    ]);
    return { status, records, actions };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().then((s) => active && setSnapshot(s));
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
      setSnapshot(await load());
      setBusy(false);
    }
  }

  const service = getAlarmService();
  const status = snapshot?.status;
  const available = status?.available ?? false;
  const needsPermission = available && status?.permission !== 'granted';
  const saved = (snapshot?.records ?? []).filter((r) => r.kind === 'saved' && r.cancelledAt === null).slice(0, 6);
  const tests = (snapshot?.records ?? []).filter((r) => r.alarmId === NATIVE_TEST_ALARM_ID).slice(0, 2);
  const actions = (snapshot?.actions ?? []).slice(0, 5);

  return (
    <Section
      title="Alarm diagnostics (developer)"
      footer="Developer tools. The flow test creates a real saved alarm called “Terbit test” (Reward, maths) about 2 minutes ahead. Apple’s own Stop control always remains.">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {status ? describeNativeStatus(status) : 'Checking…'}
        {status?.presentation ? `\nPresentation: ${status.presentation}` : ''}
        {status?.registeredAlarmCount !== undefined
          ? `\nAlarmKit holds ${status.registeredAlarmCount} alarm(s); ${status.untrackedAlarmCount ?? 0} untracked (from earlier builds).`
          : ''}
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
          title="Saved-alarm flow test (about 2 min)"
          subtitle="Real saved alarm with the Stop & Open Terbit button"
          onPress={() =>
            busy
              ? undefined
              : run(async () => {
                  const { hour, minute } = savedFlowTestTime(Date.now());
                  const existing = alarmStore.getState().alarms.find((a) => a.label === SAVED_FLOW_TEST_LABEL);
                  const draft = createAlarmDraft({
                    ...(existing ?? {}),
                    hour,
                    minute,
                    weekdays: [],
                    enabled: true,
                    label: SAVED_FLOW_TEST_LABEL,
                    mission: { type: 'math', difficulty: 'easy', questionCount: 3 },
                    completionMode: existing?.completionMode ?? 'reward',
                  });
                  const { result } = await alarmStore.save(draft, existing?.id);
                  return result
                    ? `${describeScheduleResult(result, savedFlowTestTime(Date.now()).fireAt)} (${formatAlarmTime({ hour, minute })}). Lock the phone and wait.`
                    : 'Saved, but not scheduled.';
                })
          }
        />
      )}

      {available && (
        <ListRow
          icon={{ ios: 'arrow.triangle.2.circlepath', android: 'restart_alt', web: 'restart_alt' }}
          title="Rebuild native alarms"
          subtitle="Cancel every AlarmKit alarm, then reschedule saved ones"
          onPress={() =>
            run(async () => {
              const cancelled = await service.resetNativeAlarms();
              await alarmStore.syncNative();
              return `Cancelled ${cancelled} native alarm(s) and rescheduled your enabled saved alarms.`;
            })
          }
        />
      )}

      {available && (
        <ListRow
          icon={{ ios: 'stopwatch', android: 'timer', web: 'timer' }}
          title="Raw AlarmKit test (no Terbit button)"
          subtitle="Basic one-off system alarm in 2 minutes"
          onPress={() =>
            run(async () => {
              const now = Date.now();
              const fireAt = nativeTestFireTime(now);
              const result = await service.scheduleOneTime({
                alarmId: NATIVE_TEST_ALARM_ID,
                occurrenceId: createTestOccurrenceId(now),
                fireAt,
                title: 'Terbit MY raw test',
              });
              return describeScheduleResult(result, fireAt);
            })
          }
        />
      )}

      <ListRow
        icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
        title="Refresh"
        onPress={() => run(async () => null)}
      />

      {message && (
        <ThemedText type="small" style={styles.text} accessibilityLiveRegion="polite">
          {message}
        </ThemedText>
      )}

      {saved.map((r) => (
        <View key={`${r.nativeId}-${r.createdAt}`} style={styles.record}>
          <ThemedText type="smallBold">
            Saved alarm {r.hour != null && r.minute != null ? formatAlarmTime({ hour: r.hour, minute: r.minute }) : formatClockTime(r.fireAt)}
            {r.weekdays && r.weekdays.length > 0 ? ' (weekly)' : ' (once)'} · {describeNativeState(r.state)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Mode {r.completionMode ?? '—'} · Button: {r.actionLabel ?? 'none (needs rescheduling)'}
            {r.presentation ? ` · ${r.presentation}` : ''}
          </ThemedText>
        </View>
      ))}

      {tests.map((r) => (
        <View key={`${r.nativeId}-${r.createdAt}`} style={styles.record}>
          <ThemedText type="small" themeColor="textSecondary">
            Raw test {formatClockTime(r.fireAt)} · {describeNativeState(r.state)}
          </ThemedText>
        </View>
      ))}

      {actions.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          Recent alarm button taps:{'\n'}
          {actions
            .map((a) => `${formatClockTime(a.at)} · ${a.action === 'mission' ? 'Stop & Open Terbit' : 'Stop'}`)
            .join('\n')}
        </ThemedText>
      )}
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
