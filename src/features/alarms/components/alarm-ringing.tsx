import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { describeMission, formatAlarmTime } from '@/features/alarms/alarm';
import { occurrences } from '@/features/alarms/alarms';
import { isActive, type AlarmOccurrence } from '@/features/alarms/occurrence';
import { OccurrenceError } from '@/features/alarms/occurrence-manager';
import { formatDuration, MathMissionView, MathResultSummary } from '@/features/missions/math/math-mission-view';
import type { MathMissionResult } from '@/features/missions/math/session';
import { useTheme } from '@/hooks/use-theme';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/today');
}

function clock(date: Date) {
  return formatAlarmTime({ hour: date.getHours(), minute: date.getMinutes() });
}

/**
 * The full-screen alarm: ringing → mission → morning complete (or
 * dismissed). Used for simulated alarms now, and for real AlarmKit /
 * AlarmManager alarms once they exist.
 */
export function AlarmRinging({ occurrenceId }: { occurrenceId: string }) {
  const theme = useTheme();
  const [occurrence, setOccurrence] = useState<AlarmOccurrence | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setOccurrence(await occurrences.get(occurrenceId)), [occurrenceId]);

  useEffect(() => {
    let current = true;
    occurrences.get(occurrenceId).then((o) => current && setOccurrence(o));
    return () => {
      current = false;
    };
  }, [occurrenceId]);

  // While the alarm is active, Android's back button must not skip the mission.
  const active = occurrence ? isActive(occurrence) : false;
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [active]);

  async function run(action: () => Promise<AlarmOccurrence>) {
    setBusy(true);
    try {
      setOccurrence(await action());
    } catch (error) {
      // Already finished elsewhere, or a stale state: show what is stored.
      if (error instanceof OccurrenceError) await reload();
      else Alert.alert('Something went wrong', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmDismiss() {
    Alert.alert(
      'Emergency dismiss?',
      'The alarm stops without the mission. This morning will be recorded as dismissed, not completed.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Dismiss', style: 'destructive', onPress: () => run(() => occurrences.dismiss(occurrenceId)) },
      ],
    );
  }

  let content: ReactNode;
  if (occurrence === undefined) {
    content = <ThemedText themeColor="textSecondary">Loading…</ThemedText>;
  } else if (occurrence === null) {
    content = <Finished title="Alarm not found" description="This alarm occurrence doesn’t exist." />;
  } else {
    switch (occurrence.status) {
      case 'scheduled':
      case 'started':
        content = (
          <Ringing
            occurrence={occurrence}
            busy={busy}
            onStart={() =>
              run(() =>
                occurrence.mission.type === 'none'
                  ? occurrences.completeWithoutMission(occurrenceId)
                  : occurrences.startMission(occurrenceId),
              )
            }
            onDismiss={confirmDismiss}
          />
        );
        break;
      case 'mission_in_progress':
        content = (
          <Mission
            occurrence={occurrence}
            onComplete={(result) => run(() => occurrences.completeMission(occurrenceId, result))}
            onDismiss={confirmDismiss}
          />
        );
        break;
      case 'completed':
        content = <MorningComplete occurrence={occurrence} />;
        break;
      case 'dismissed':
        content = (
          <Finished
            title="Alarm dismissed"
            description="Recorded as dismissed, not completed. You can see it in Recent mornings."
          />
        );
        break;
      case 'missed':
      case 'cancelled':
        content = (
          <Finished
            title={occurrence.status === 'missed' ? 'Alarm missed' : 'Alarm cancelled'}
            description="This alarm is no longer active."
          />
        );
        break;
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        <View style={styles.inner}>
          {occurrence?.source === 'simulated' && (
            <Notice
              title="Simulation"
              description="This is a test started with “Simulate alarm now”. No real system alarm fired."
            />
          )}
          {content}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Ringing(props: {
  occurrence: AlarmOccurrence;
  busy: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { occurrence, busy, onStart, onDismiss } = props;
  const now = useNow();
  const hasMission = occurrence.mission.type !== 'none';

  return (
    <>
      <View style={styles.hero}>
        <ThemedText style={styles.clock} accessibilityRole="header">
          {clock(now)}
        </ThemedText>
        <ThemedText type="headline">{occurrence.alarmLabel || 'Alarm'}</ThemedText>
        <ThemedText themeColor="textSecondary">{describeMission(occurrence.mission)}</ThemedText>
      </View>

      <Button title={hasMission ? 'Start mission' : 'Turn off alarm'} onPress={onStart} disabled={busy} />
      <Button title="Snooze (not available yet)" variant="secondary" onPress={() => {}} disabled />
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {occurrence.snoozeMinutes === null
          ? 'Snooze is off for this alarm.'
          : `Snooze (${occurrence.snoozeMinutes} min) needs native alarms, which aren’t built yet.`}
      </ThemedText>

      {hasMission && <DismissLink onPress={onDismiss} disabled={busy} />}
    </>
  );
}

function Mission(props: {
  occurrence: AlarmOccurrence;
  onComplete: (result: MathMissionResult) => void;
  onDismiss: () => void;
}) {
  const { occurrence, onComplete, onDismiss } = props;
  const now = useNow();
  if (occurrence.mission.type !== 'math') return null;

  return (
    <>
      <ThemedText type="headline" style={styles.center}>
        {clock(now)} · {occurrence.alarmLabel || 'Alarm'}
      </ThemedText>
      <MathMissionView
        config={{ difficulty: occurrence.mission.difficulty, questionCount: occurrence.mission.questionCount }}
        onComplete={onComplete}
      />
      <DismissLink onPress={onDismiss} />
    </>
  );
}

function MorningComplete({ occurrence }: { occurrence: AlarmOccurrence }) {
  const result = occurrence.result?.kind === 'mission_completed' ? occurrence.result.mission : null;
  const finishedAt = occurrence.endedAt;
  const tookMs = finishedAt !== null && occurrence.startedAt !== null ? finishedAt - occurrence.startedAt : null;

  return (
    <>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="title">Morning complete</ThemedText>
        {finishedAt !== null && <ThemedText>You were up at {clock(new Date(finishedAt))}.</ThemedText>}
        {result && <MathResultSummary result={result} />}
        {tookMs !== null && (
          <ThemedText themeColor="textSecondary">From alarm to done: {formatDuration(tookMs)}</ThemedText>
        )}
      </ThemedView>
      <Button title="Done" onPress={close} />
    </>
  );
}

function Finished({ title, description }: { title: string; description: string }) {
  return (
    <>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {description}
        </ThemedText>
      </ThemedView>
      <Button title="Done" onPress={close} />
    </>
  );
}

function DismissLink({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Stops the alarm without the mission. Recorded as dismissed."
      onPress={onPress}
      disabled={disabled}
      style={styles.dismiss}>
      <ThemedText type="small" style={styles.dismissText}>
        Emergency dismiss
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: Spacing.three,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.five,
  },
  clock: {
    fontSize: 72,
    lineHeight: 84,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  dismiss: {
    alignSelf: 'center',
    padding: Spacing.three,
  },
  dismissText: {
    color: '#FF3B30',
  },
});
