import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MOBILITY_PROFILE_OPTIONS } from '@/features/accessibility/accessibility-settings';
import { COMPLETION_MODE_LABEL, COMPLETION_MODES, formatAlarmTime, MAX_SNOOZES, SNOOZE_MINUTES, type CompletionMode } from '@/features/alarms/alarm';
import { isModeAvailable, MODE_FEATURE } from '@/features/alarms/alarm-features';
import { TimeField } from '@/features/alarms/components/time-field';
import { MISSION_CATEGORIES, type MissionCategory } from '@/features/alarms/creation';
import { useEntitlement } from '@/features/entitlements/entitlements';
import { FAITH_PREFERENCE_LABEL, FAITH_PREFERENCES } from '@/features/faith/types';
import { sleepFocusGuidance } from '@/features/night/labels';
import { useNightRoutine } from '@/features/night/night';
import { nightMinutes, type ClockTime } from '@/features/night/night-routine';

import { PERSONALISATION_DEFAULTS } from '../baseline';
import { RadioList } from './radio-list';
import type { OnboardingDraft } from '../flow';
import { GENDER_LABEL, MODE_EXPLANATION, PRIVACY_NOTE } from '../labels';
import { suggestedTime } from '../plan';
import { cameraEligible, categoryTitle, goalOptions, goalTitle, validGoal } from '../recommend';
import { DAY_PART_LABEL, DAY_PARTS, GENDERS, type DayPart, type FitnessGoal, type GoalAnswer, type Goals, type PersonalisationAnswers } from '../types';

export type StepProps = { draft: OnboardingDraft; onAnswer: (change: Partial<PersonalisationAnswers>) => void };

const chosenGoals = (goals: Goals) => MISSION_CATEGORIES.filter((c) => goals[c] !== null);

function withGoal(goals: Goals, category: MissionCategory, change: Partial<GoalAnswer>): Goals {
  return { ...goals, [category]: { ...goals[category]!, ...change } };
}

// ── 1. About you ─────────────────────────────────────────────────────────────

export function AboutStep({ draft, onAnswer }: StepProps) {
  const { answers } = draft;
  return (
    <>
      <Section title="Gender" footer={PRIVACY_NOTE.gender}>
        <RadioList options={GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] }))} value={answers.gender} onChange={(gender) => onAnswer({ gender })} />
      </Section>
      <Section title="Faith" footer={PRIVACY_NOTE.faith}>
        <RadioList
          options={FAITH_PREFERENCES.map((p) => ({ value: p, label: FAITH_PREFERENCE_LABEL[p] }))}
          value={answers.faith}
          onChange={(faith) => onAnswer({ faith })}
        />
      </Section>
      <Section title="How do you like to move?" footer={PRIVACY_NOTE.mobility}>
        <RadioList options={MOBILITY_PROFILE_OPTIONS} value={answers.mobilityProfile} onChange={(mobilityProfile) => onAnswer({ mobilityProfile })} />
      </Section>
    </>
  );
}

// ── 2. Goals ─────────────────────────────────────────────────────────────────

export function GoalsStep({ draft, onAnswer }: StepProps) {
  const { answers } = draft;
  const context = { mobilityProfile: answers.mobilityProfile, faith: answers.faith };
  const choose = (category: MissionCategory, goal: string | null) => {
    const current = answers.goals[category];
    const next: Goals = {
      ...answers.goals,
      [category]: goal === null ? null : { mode: PERSONALISATION_DEFAULTS.mode, part: PERSONALISATION_DEFAULTS.part, time: null, ...current, goal },
    };
    onAnswer({ goals: next });
  };
  return (
    <>
      <ThemedText themeColor="textSecondary">What do you want Terbit to help you achieve? Choose one goal for each, or “Not now”.</ThemedText>
      {MISSION_CATEGORIES.map((category) => {
        // A goal from another Mobility Profile or Faith shows (and is planned as) its fallback.
        const current = answers.goals[category];
        const selected = current ? (validGoal(category, current.goal as never, context) as string) : null;
        const options = goalOptions(category, context);
        const fitnessCamera =
          category === 'fitness' && selected && cameraEligible(selected as FitnessGoal, answers.mobilityProfile)
            ? 'Optional camera counting is available for this activity.'
            : undefined;
        return (
          <Section key={category} title={categoryTitle(category, context)} footer={fitnessCamera}>
            <RadioList
              options={[...options.map((o) => ({ value: o.id as string | null, label: o.title, description: o.subtitle })), { value: null, label: 'Not now' }]}
              value={selected}
              onChange={(goal) => choose(category, goal)}
            />
          </Section>
        );
      })}
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        {PRIVACY_NOTE.goals}
      </ThemedText>
    </>
  );
}

// ── 3. Accountability mode, per goal ─────────────────────────────────────────

export function ModesStep({ draft, onAnswer }: StepProps) {
  const { has, isPremium } = useEntitlement();
  const { answers } = draft;
  const context = { mobilityProfile: answers.mobilityProfile, faith: answers.faith };
  // Gentle → Reward → Challenge, always. Challenge is planned for Terbit+ (no purchase yet).
  const options = COMPLETION_MODES.map((mode) => ({
    value: mode,
    label: isPremium(MODE_FEATURE[mode]) && !isModeAvailable(mode, has) ? `${COMPLETION_MODE_LABEL[mode]} 🔒` : COMPLETION_MODE_LABEL[mode],
  }));
  const locked = COMPLETION_MODES.some((m) => isPremium(MODE_FEATURE[m]) && !isModeAvailable(m, has));
  const choose = (category: MissionCategory, mode: CompletionMode) => {
    if (!isModeAvailable(mode, has)) {
      Alert.alert(`${COMPLETION_MODE_LABEL[mode]} is coming with Terbit+`, 'Terbit+ isn’t available yet. Gentle and Reward are always included.');
      return;
    }
    onAnswer({ goals: withGoal(answers.goals, category, { mode }) });
  };
  return (
    <>
      <Section footer={locked ? 'Challenge is planned for Terbit+ (not available yet). Gentle and Reward are always included.' : undefined}>
        {COMPLETION_MODES.map((mode) => (
          <ListRow
            key={mode}
            icon={
              mode === 'gentle'
                ? { ios: 'leaf', android: 'spa', web: 'spa' }
                : mode === 'reward'
                  ? { ios: 'star', android: 'star', web: 'star' }
                  : { ios: 'bolt', android: 'bolt', web: 'bolt' }
            }
            title={MODE_EXPLANATION[mode].title}
            subtitle={MODE_EXPLANATION[mode].summary}
          />
        ))}
      </Section>
      {chosenGoals(answers.goals).map((category) => (
        <Section key={category} title={`${categoryTitle(category, context)} · ${goalTitle(category, answers.goals[category]!.goal as never, context)}`}>
          <ChoiceRow options={options} value={answers.goals[category]!.mode} onChange={(mode) => choose(category, mode)} />
        </Section>
      ))}
    </>
  );
}

// ── 4. Morning / Afternoon / Night, per goal ─────────────────────────────────

function GoalTime({ part, time, suggestion, onChange }: { part: Exclude<DayPart, 'morning'>; time: ClockTime | null; suggestion: ClockTime; onChange: (time: ClockTime | null) => void }) {
  const [open, setOpen] = useState(time !== null);
  const shown = time ?? suggestion;
  return (
    <>
      <ListRow
        icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
        title={time ? 'Your time' : 'Suggested time'}
        value={formatAlarmTime(shown)}
        onPress={() => setOpen(!open)}
      />
      {open && <TimeField hour={shown.hour} minute={shown.minute} onChange={(hour, minute) => onChange({ hour, minute })} />}
      {time && <ListRow icon={{ ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }} title="Use the suggested time" onPress={() => { onChange(null); setOpen(false); }} />}
      {part === 'night' && !time && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.inset}>
          Suggested 30 minutes before your wind-down.
        </ThemedText>
      )}
    </>
  );
}

export function TimesStep({ draft, onAnswer }: StepProps) {
  const { answers } = draft;
  const context = { mobilityProfile: answers.mobilityProfile, faith: answers.faith };
  const goals = chosenGoals(answers.goals);
  const firstMorning = goals.find((c) => answers.goals[c]!.part === 'morning');
  return (
    <>
      <ThemedText themeColor="textSecondary">Choose when Terbit should hold you accountable for each goal. You can fine-tune exact times later.</ThemedText>
      {goals.map((category) => {
        const goal = answers.goals[category]!;
        const footer =
          goal.part === 'morning'
            ? category === firstMorning
              ? 'Your Main Wake-Up’s mission: done when you get up.'
              : 'Shortly after your Main Wake-Up, as its own alarm.'
            : undefined;
        return (
          <Section key={category} title={categoryTitle(category, context)} footer={footer}>
            <ChoiceRow
              options={DAY_PARTS.map((p) => ({ value: p, label: DAY_PART_LABEL[p] }))}
              value={goal.part}
              onChange={(part) => onAnswer({ goals: withGoal(answers.goals, category, { part, time: null }) })}
            />
            {goal.part !== 'morning' && (
              <GoalTime
                key={goal.part}
                part={goal.part}
                time={goal.time}
                suggestion={suggestedTime(goal.part, answers.sleep ?? PERSONALISATION_DEFAULTS.sleep)}
                onChange={(time) => onAnswer({ goals: withGoal(answers.goals, category, { time }) })}
              />
            )}
          </Section>
        );
      })}
    </>
  );
}

// ── 5. Wake-up and snooze ────────────────────────────────────────────────────

export function WakeStep({ draft, onAnswer }: StepProps) {
  const { wake } = draft.answers;
  const set = (change: Partial<typeof wake>) => onAnswer({ wake: { ...wake, ...change } });
  return (
    <>
      <Section title="Main Wake-Up · Weekdays" footer="Monday to Friday. Your Main Wake-Up is the alarm your morning streak follows.">
        <TimeField hour={wake.weekday.hour} minute={wake.weekday.minute} onChange={(hour, minute) => set({ weekday: { hour, minute } })} />
      </Section>
      <Section title="Weekends" footer={wake.weekend === 'off' ? 'No Main Wake-Up on Saturday and Sunday.' : undefined}>
        <ChoiceRow
          options={[
            { value: 'same' as const, label: 'Same time' },
            { value: 'different' as const, label: 'Different' },
            { value: 'off' as const, label: 'No alarm' },
          ]}
          value={wake.weekend}
          onChange={(weekend) => set({ weekend })}
        />
        {wake.weekend === 'different' && (
          <TimeField hour={wake.weekendTime.hour} minute={wake.weekendTime.minute} onChange={(hour, minute) => set({ weekendTime: { hour, minute } })} />
        )}
      </Section>
      <Section title="Snooze" footer="Snooze is for your Main Wake-Up only. Reward and Challenge give you the snooze time back in the mission window.">
        <SwitchRow title="Allow snooze" value={wake.snooze.enabled} onValueChange={(enabled) => set({ snooze: { ...wake.snooze, enabled } })} />
        {wake.snooze.enabled && (
          <>
            <ChoiceRow
              title="Every"
              options={SNOOZE_MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
              value={wake.snooze.minutes}
              onChange={(minutes) => set({ snooze: { ...wake.snooze, minutes } })}
            />
            <ChoiceRow
              title="Up to"
              options={MAX_SNOOZES.map((n) => ({ value: n, label: `${n}×` }))}
              value={wake.snooze.maxSnoozes}
              onChange={(maxSnoozes) => set({ snooze: { ...wake.snooze, maxSnoozes } })}
            />
          </>
        )}
      </Section>
    </>
  );
}

// ── 6. Wind-down and bedtime ─────────────────────────────────────────────────

export function sleepError(sleep: PersonalisationAnswers['sleep']): string | null {
  if (!sleep) return null;
  return nightMinutes(sleep.windDown) > nightMinutes(sleep.bedtime) ? 'Wind-down must start before bedtime.' : null;
}

export function SleepStep({ draft, onAnswer }: StepProps) {
  // A skipped step shows (and Continue saves) what the phone already has.
  const sleep = draft.answers.sleep ?? draft.baseline.sleep ?? PERSONALISATION_DEFAULTS.sleep;
  const set = (change: Partial<typeof sleep>) => onAnswer({ sleep: { ...sleep, ...change } });
  const error = sleepError(sleep);
  const { routine } = useNightRoutine();
  return (
    <>
      <Section title="Wind-down target" footer="When you want your digital quiet time to begin.">
        <TimeField hour={sleep.windDown.hour} minute={sleep.windDown.minute} onChange={(hour, minute) => set({ windDown: { hour, minute } })} />
      </Section>
      <Section title="Bedtime target" footer="When you aim to be asleep.">
        <TimeField hour={sleep.bedtime.hour} minute={sleep.bedtime.minute} onChange={(hour, minute) => set({ bedtime: { hour, minute } })} />
      </Section>
      {error && <Notice title="Check your times" description={error} />}
      {/* Saving targets never sets up a Night Routine: that's this explicit choice (planned for Terbit+). */}
      <Section
        title="Night Routine (optional)"
        footer={
          routine
            ? 'Off: your current Night Routine stays exactly as it is. On: its wind-down and bedtime change to these times; your apps and other settings stay.'
            : 'A Night Routine adds wind-down reminders and can restrict chosen apps from wind-down. Off: Terbit only keeps these times as your targets.'
        }>
        <SwitchRow
          title={routine ? 'Update my Night Routine' : 'Add a Night Routine'}
          value={draft.answers.nightRoutine}
          onValueChange={(nightRoutine) => onAnswer({ sleep, nightRoutine })}
        />
      </Section>
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        {sleepFocusGuidance(sleep.windDown)}
      </ThemedText>
    </>
  );
}

/** The bottom buttons shared by every question step. */
export function StepButtons({ onBack, onContinue, canGoBack, disabled, continueTitle = 'Continue' }: { onBack: () => void; onContinue: () => void; canGoBack: boolean; disabled?: boolean; continueTitle?: string }) {
  return (
    <View style={styles.buttons}>
      <Button title={continueTitle} onPress={onContinue} disabled={disabled} />
      {canGoBack && <Button title="Back" variant="secondary" onPress={onBack} />}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: Spacing.three },
  inset: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  buttons: { gap: Spacing.two },
});
