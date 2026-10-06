import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { Spacing } from '@/constants/theme';
import {
  describeRepeat,
  MAX_LABEL_LENGTH,
  SNOOZE_MINUTES,
  type AlarmDraft,
  type AlarmMission,
} from '@/features/alarms/alarm';
import { alarmStore, occurrences } from '@/features/alarms/alarms';
import type { MathDifficulty, MathQuestionCount } from '@/features/missions/math/questions';
import { MATH_QUESTION_COUNTS } from '@/features/missions/math/questions';
import { useTheme } from '@/hooks/use-theme';

import { RingingStatus } from './ringing-status';
import { TimeField } from './time-field';
import { WeekdayPicker } from './weekday-picker';

type AlarmEditorProps = {
  initial: AlarmDraft;
  /** Set when editing an existing alarm. */
  alarmId?: string;
};

const missionOptions = [
  { value: 'math', label: 'Maths' },
  { value: 'none', label: 'None' },
] as const;

const difficultyOptions: { value: MathDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const countOptions = MATH_QUESTION_COUNTS.map((count) => ({ value: count, label: `${count} questions` }));
const snoozeOptions = SNOOZE_MINUTES.map((minutes) => ({ value: minutes, label: `${minutes} min` }));

const defaultMathMission: AlarmMission = { type: 'math', difficulty: 'easy', questionCount: 3 };

export function AlarmEditor({ initial, alarmId }: AlarmEditorProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  const update = (changes: Partial<AlarmDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const mission = draft.mission;

  async function save() {
    setSaving(true);
    try {
      await alarmStore.save(draft, alarmId);
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Couldn’t save alarm', error instanceof Error ? error.message : String(error));
    }
  }

  async function simulate(id: string) {
    try {
      const saved = await alarmStore.find(id);
      if (!saved) return;
      const occurrence = await occurrences.trigger(saved, { scheduledAt: Date.now(), source: 'simulated' });
      router.push({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: occurrence.id } });
    } catch (error) {
      Alert.alert('Couldn’t start simulation', error instanceof Error ? error.message : String(error));
    }
  }

  function confirmDelete() {
    if (!alarmId) return;
    Alert.alert('Delete this alarm?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await alarmStore.remove(alarmId);
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <RingingStatus />

      <Section>
        <TimeField hour={draft.hour} minute={draft.minute} onChange={(hour, minute) => update({ hour, minute })} />
      </Section>

      <Section title="Repeat" footer={describeRepeat(draft.weekdays)}>
        <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => update({ weekdays })} />
      </Section>

      <Section>
        <TextInput
          value={draft.label}
          onChangeText={(label) => update({ label })}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="Label (optional), e.g. Subuh"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Alarm label"
          style={[styles.input, { color: theme.text }]}
        />
        <SwitchRow title="Alarm on" value={draft.enabled} onValueChange={(enabled) => update({ enabled })} />
        <SwitchRow
          title="Main wake-up alarm"
          subtitle="Used for your morning streak. Only one alarm can be the main one."
          value={draft.isPrimary}
          onValueChange={(isPrimary) => update({ isPrimary })}
        />
      </Section>

      <Section
        title="Wake-up mission"
        footer={
          mission.type === 'math'
            ? 'Solve these to turn the alarm off. A wrong answer means you try that question again.'
            : 'Without a mission, the alarm can be turned off straight away.'
        }>
        <ChoiceRow
          options={missionOptions}
          value={mission.type}
          onChange={(type) => update({ mission: type === 'none' ? { type: 'none' } : defaultMathMission })}
        />
        {mission.type === 'math' && (
          <ChoiceRow
            title="Difficulty"
            options={difficultyOptions}
            value={mission.difficulty}
            onChange={(difficulty) => update({ mission: { ...mission, difficulty } })}
          />
        )}
        {mission.type === 'math' && (
          <ChoiceRow<MathQuestionCount>
            title="Questions"
            options={countOptions}
            value={mission.questionCount}
            onChange={(questionCount) => update({ mission: { ...mission, questionCount } })}
          />
        )}
        {mission.type === 'math' && (
          <ListRow
            icon={{ ios: 'play.circle', android: 'play_circle', web: 'play_circle' }}
            title="Try this mission"
            subtitle="Practice only. No alarm will ring."
            href={{
              pathname: '/alarms/practice',
              params: { difficulty: mission.difficulty, count: String(mission.questionCount) },
            }}
          />
        )}
      </Section>

      <Section title="Snooze">
        <SwitchRow
          title="Allow snooze"
          value={draft.snooze.enabled}
          onValueChange={(enabled) => update({ snooze: { ...draft.snooze, enabled } })}
        />
        {draft.snooze.enabled && (
          <ChoiceRow
            options={snoozeOptions}
            value={draft.snooze.minutes}
            onChange={(minutes) => update({ snooze: { ...draft.snooze, minutes } })}
          />
        )}
      </Section>

      {/* Developer/testing only: hidden in release builds. */}
      {__DEV__ && alarmId && (
        <Section
          title="Testing"
          footer="Simulation only: opens the alarm screen as if this alarm rang, using its saved settings. No real system alarm fires.">
          <ListRow
            icon={{ ios: 'bell.badge', android: 'notifications_active', web: 'notifications_active' }}
            title="Simulate alarm now"
            subtitle="Test the ringing screen and mission"
            onPress={() => simulate(alarmId)}
          />
        </Section>
      )}

      <View style={styles.actions}>
        <Button title={alarmId ? 'Save changes' : 'Save alarm'} onPress={save} disabled={saving} />
        {alarmId && <Button title="Delete alarm" variant="destructive" onPress={confirmDelete} />}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 17,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
