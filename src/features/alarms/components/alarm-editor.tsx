import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { Spacing } from '@/constants/theme';
import { MODE_POLICIES } from '@/features/alarms/accountability';
import { isModeAvailable, MODE_FEATURE } from '@/features/alarms/alarm-features';
import { findSound } from '@/features/alarms/sounds';
import { useEntitlement } from '@/features/entitlements/entitlements';
import { FEATURE_LABEL } from '@/features/entitlements/features';
import {
  COMPLETION_MODE_LABEL,
  COMPLETION_MODES,
  describeRepeat,
  GENTLE_REMINDER_MINUTES,
  MAX_LABEL_LENGTH,
  SNOOZE_MINUTES,
  type AlarmDraft,
  type AlarmMission,
  type CompletionMode,
  missionDifficulty,
} from '@/features/alarms/alarm';
import { alarmStore, occurrences } from '@/features/alarms/alarms';
import { faithMissionKinds, primaryTradition, visibleTraditions, type FaithMissionKind } from '@/features/faith/faith-settings';
import { FAITH_POLICY } from '@/features/faith/policy';
import { TRADITION_LABEL, type FaithSettings } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';
import { EXERCISES, formatSeconds, formatTarget } from '@/features/missions/fitness/exercises';
import { FITNESS_EXERCISES } from '@/features/missions/fitness/types';
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_LABEL, QUIZ_CATEGORY_SHORT } from '@/features/missions/quiz/types';
import {
  DIFFICULTY_LABEL,
  MISSION_DIFFICULTIES,
  MISSION_QUESTION_COUNTS,
  type MissionDifficulty,
  type MissionQuestionCount,
} from '@/features/missions/types';
import { useTheme } from '@/hooks/use-theme';
import { getAlarmService } from '@/services/alarm-scheduler';
import { getReminderService } from '@/services/notifications';

import { RingingStatus } from './ringing-status';
import { TimeField } from './time-field';
import { WeekdayPicker } from './weekday-picker';

type AlarmEditorProps = {
  initial: AlarmDraft;
  /** Set when editing an existing alarm. */
  alarmId?: string;
};

/** The top-level choice; Recitation and Reflection are both under Faith. */
type MissionGroup = 'math' | 'quiz' | 'fitness' | 'faith' | 'none';

const missionOptions: { value: MissionGroup; label: string }[] = [
  { value: 'math', label: 'Maths' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'faith', label: 'Faith' },
  { value: 'none', label: 'None' },
];

const groupOf = (mission: AlarmMission): MissionGroup =>
  mission.type === 'recitation' || mission.type === 'reflection' || mission.type === 'recitation_reflection' ? 'faith' : mission.type;

const FAITH_KIND_LABEL: Record<FaithMissionKind, string> = {
  recitation: 'Recitation',
  reflection: 'Reflection',
  recitation_reflection: 'Both',
};

const topicOptions = QUIZ_CATEGORIES.map((category) => ({ value: category, label: QUIZ_CATEGORY_SHORT[category] }));
const difficultyOptions = MISSION_DIFFICULTIES.map((difficulty) => ({ value: difficulty, label: DIFFICULTY_LABEL[difficulty] }));
const countOptions = MISSION_QUESTION_COUNTS.map((count) => ({ value: count, label: `${count} questions` }));
const gentleOptions = GENTLE_REMINDER_MINUTES.map((minutes) => ({ value: minutes, label: `${minutes} min` }));
const snoozeOptions = SNOOZE_MINUTES.map((minutes) => ({ value: minutes, label: `${minutes} min` }));

const exerciseOptions = FITNESS_EXERCISES.map((exercise) => ({ value: exercise, label: EXERCISES[exercise].short }));

/**
 * Switching mission type keeps the difficulty (and question count) already
 * chosen. Faith starts with the user's default: Recitation in their own
 * tradition, or Reflection for Non-religious / Prefer not to say.
 */
function missionOfType(type: MissionGroup | FaithMissionKind, current: AlarmMission, faith: FaithSettings): AlarmMission {
  const difficulty: MissionDifficulty = missionDifficulty(current) ?? 'easy';
  if (type === 'faith') return missionOfType(faithMissionKinds(faith)[0], current, faith);
  if (type === 'recitation') {
    const tradition = primaryTradition(faith) ?? visibleTraditions(faith)[0];
    return tradition ? { type: 'recitation', tradition } : { type: 'reflection', difficulty };
  }
  if (type === 'reflection') return { type: 'reflection', difficulty };
  if (type === 'recitation_reflection') {
    const tradition = current.type === 'recitation' ? current.tradition : (primaryTradition(faith) ?? visibleTraditions(faith)[0]);
    return tradition ? { type: 'recitation_reflection', tradition, difficulty } : { type: 'reflection', difficulty };
  }
  const questionCount: MissionQuestionCount = current.type === 'math' || current.type === 'quiz' ? current.questionCount : 3;
  if (type === 'math') return { type: 'math', difficulty, questionCount };
  if (type === 'quiz') return { type: 'quiz', category: current.type === 'quiz' ? current.category : 'general', difficulty, questionCount };
  if (type === 'fitness') return { type: 'fitness', exercise: current.type === 'fitness' ? current.exercise : 'squats', difficulty };
  return { type: 'none' };
}

const MISSION_FOOTER: Record<AlarmMission['type'], string> = {
  math: 'Solve these to turn the alarm off. A wrong answer means you try that question again.',
  quiz: 'Answer each question to turn the alarm off. You see the right answer after each one; every completed quiz earns Education XP.',
  fitness:
    'Do the exercise to turn the alarm off and earn Fitness XP. Reps and time are self-reported for now (no camera). Go at your own pace and stop if anything hurts.',
  recitation:
    'Read or recite today’s Daily Recitation to turn the alarm off and earn Faith XP. Self-reported: Terbit MY can’t check recitation. Today’s passage is saved on the phone ahead of time, so it works offline.',
  reflection:
    'A guided Reflection / Meditation with today’s theme, prompts and relaxation music. Earns Faith XP. The music plays even in silent mode.',
  recitation_reflection:
    'Recitation + Reflection: today’s Daily Recitation first, then a guided Reflection. The alarm’s mission is done when both are finished, and it earns Faith XP once.',
  none: 'Without a mission, the alarm can be turned off straight away.',
};

const reflectionLengthOptions = MISSION_DIFFICULTIES.map((difficulty) => ({
  value: difficulty,
  label: formatSeconds(FAITH_POLICY.reflection.durationSec[difficulty]),
}));

export function AlarmEditor({ initial, alarmId }: AlarmEditorProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  const { has, isPremium } = useEntitlement();

  const update = (changes: Partial<AlarmDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const mission = draft.mission;
  const faith = useFaithSettings();
  const faithKinds = faithMissionKinds(faith);
  const difficulty = missionDifficulty(mission);
  const traditionChoices =
    mission.type === 'recitation' || mission.type === 'recitation_reflection'
      ? [...new Set([...visibleTraditions(faith), mission.tradition])].map((t) => ({ value: t, label: TRADITION_LABEL[t] }))
      : [];
  const savedModeLocked = !isModeAvailable(draft.completionMode, has);

  // Labels come from the entitlement layer: nothing here decides what is premium.
  const modeChoices = COMPLETION_MODES.map((mode) => ({
    value: mode,
    label:
      !isModeAvailable(mode, has) && isPremium(MODE_FEATURE[mode])
        ? `${COMPLETION_MODE_LABEL[mode]} 🔒`
        : COMPLETION_MODE_LABEL[mode],
  }));

  function chooseMode(completionMode: CompletionMode) {
    if (!isModeAvailable(completionMode, has)) {
      Alert.alert(
        `${COMPLETION_MODE_LABEL[completionMode]} Mode isn’t included in your plan`,
        `${FEATURE_LABEL[MODE_FEATURE[completionMode]]} is a premium feature. Purchases aren’t available yet.`,
      );
      return;
    }
    update({ completionMode });
  }

  async function save() {
    setSaving(true);
    try {
      const { result } = await alarmStore.save(draft, alarmId);
      // Gentle mode follow-ups use local notifications: ask once, when it's first needed.
      if (draft.completionMode === 'gentle' && draft.enabled) await getReminderService().requestPermission();
      if (result?.status === 'permission-denied' || result?.status === 'failed') {
        // Saved in Terbit MY, but the phone couldn't schedule it.
        Alert.alert(
          'Alarm saved, but it can’t ring yet',
          result.message ?? 'Terbit MY doesn’t have permission to set alarms.',
          [
            { text: 'OK', onPress: () => router.back() },
            {
              text: 'Fix permissions',
              onPress: async () => {
                const service = getAlarmService();
                const status = await service.requestNativeAlarmPermission();
                if (status.permission !== 'granted') await service.openNativeAlarmSettings();
                else await alarmStore.syncNative();
                router.back();
              },
            },
          ],
        );
        return;
      }
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
      // Simulate with the mode the alarm would really ring with (entitlement-adjusted).
      const occurrence = await occurrences.trigger(alarmStore.effective(saved), { scheduledAt: Date.now(), source: 'simulated' });
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
          groupOf(mission) === 'faith' && !faithKinds.includes('recitation')
            ? `${MISSION_FOOTER[mission.type]} To add Recitation, choose your faith in Settings → Faith.`
            : MISSION_FOOTER[mission.type]
        }>
        <ChoiceRow
          options={missionOptions}
          value={groupOf(mission)}
          onChange={(type) => update({ mission: missionOfType(type, mission, faith) })}
        />
        {groupOf(mission) === 'faith' && faithKinds.length > 1 && (
          <ChoiceRow
            options={faithKinds.map((kind) => ({ value: kind, label: FAITH_KIND_LABEL[kind] }))}
            value={mission.type as FaithMissionKind}
            onChange={(kind) => update({ mission: missionOfType(kind, mission, faith) })}
          />
        )}
        {(mission.type === 'recitation' || mission.type === 'recitation_reflection') && traditionChoices.length > 1 && (
          <ChoiceRow
            title="Tradition"
            options={traditionChoices}
            value={mission.tradition}
            onChange={(tradition) => update({ mission: { ...mission, tradition } })}
          />
        )}
        {(mission.type === 'reflection' || mission.type === 'recitation_reflection') && (
          <ChoiceRow
            title={`${mission.type === 'reflection' ? 'Length' : 'Reflection length'}: ${DIFFICULTY_LABEL[mission.difficulty]}`}
            options={reflectionLengthOptions}
            value={mission.difficulty}
            onChange={(next) => update({ mission: { ...mission, difficulty: next } })}
          />
        )}
        {mission.type === 'quiz' && (
          <ChoiceRow
            title={`Topic: ${QUIZ_CATEGORY_LABEL[mission.category]}`}
            options={topicOptions}
            value={mission.category}
            onChange={(category) => update({ mission: { ...mission, category } })}
          />
        )}
        {mission.type === 'fitness' && (
          <ChoiceRow
            title={`Exercise: ${EXERCISES[mission.exercise].label} · ${formatTarget(mission.exercise, mission.difficulty)}`}
            options={exerciseOptions}
            value={mission.exercise}
            onChange={(exercise) => update({ mission: { ...mission, exercise } })}
          />
        )}
        {(mission.type === 'math' || mission.type === 'quiz' || mission.type === 'fitness') && (
          <ChoiceRow
            title="Difficulty"
            options={difficultyOptions}
            value={mission.difficulty}
            onChange={(next) => update({ mission: { ...mission, difficulty: next } })}
          />
        )}
        {(mission.type === 'math' || mission.type === 'quiz') && (
          <ChoiceRow<MissionQuestionCount>
            title="Questions"
            options={countOptions}
            value={mission.questionCount}
            onChange={(questionCount) => update({ mission: { ...mission, questionCount } })}
          />
        )}
        {mission.type !== 'none' && (
          <ListRow
            icon={{ ios: 'play.circle', android: 'play_circle', web: 'play_circle' }}
            title="Try this mission"
            subtitle="Practice only. No alarm rings and no XP is earned."
            href={{
              pathname: '/alarms/practice',
              params: {
                mission: mission.type,
                category: mission.type === 'quiz' ? mission.category : undefined,
                exercise: mission.type === 'fitness' ? mission.exercise : undefined,
                tradition: mission.type === 'recitation' || mission.type === 'recitation_reflection' ? mission.tradition : undefined,
                difficulty: difficulty ?? undefined,
                count: mission.type === 'math' || mission.type === 'quiz' ? String(mission.questionCount) : undefined,
              },
            }}
          />
        )}
      </Section>

      {mission.type !== 'none' && (
        <Section
          title="Accountability mode (beta)"
          footer={
            savedModeLocked
              ? `Saved as ${COMPLETION_MODE_LABEL[draft.completionMode]}, which isn’t in your plan, so this alarm behaves as Reward. The phone’s own Stop button always works.`
              : `${MODE_POLICIES[draft.completionMode].description} The phone’s own Stop button always works.`
          }>
          <ChoiceRow options={modeChoices} value={draft.completionMode} onChange={chooseMode} />
          {draft.completionMode === 'gentle' && (
            <ChoiceRow
              title="Follow up after"
              options={gentleOptions}
              value={draft.gentleReminderMinutes}
              onChange={(gentleReminderMinutes) => update({ gentleReminderMinutes })}
            />
          )}
        </Section>
      )}

      <Section title="Sound">
        <ListRow
          icon={{ ios: 'speaker.wave.2', android: 'volume_up', web: 'volume_up' }}
          title="Alarm sound"
          value={findSound(draft.soundId).label}
        />
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
