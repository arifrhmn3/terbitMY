import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { COMPLETION_MODE_LABEL } from '@/features/alarms/alarm';

import type { RoutineChanges } from '../apply';
import { STEP_TITLE, type OnboardingDraft, type OnboardingStep } from '../flow';
import { personalisation } from '../personalisation';
import type { RoutinePlan } from '../plan';
import type { RoutinePreview } from '../preview';
import { DAY_PART_LABEL } from '../types';

type Review = { plan: RoutinePlan; preview: RoutinePreview; changes: RoutineChanges };

const ADJUSTABLE: { step: Exclude<OnboardingStep, 'review'>; title: string }[] = [
  { step: 'goals', title: 'Goals' },
  { step: 'modes', title: 'Accountability modes' },
  { step: 'times', title: 'Morning, Afternoon or Night' },
  { step: 'wake', title: 'Wake-up and snooze' },
  { step: 'sleep', title: 'Wind-down and bedtime' },
  { step: 'about', title: 'About you' },
];

/**
 * Step 7: the proposed weekly routine. Nothing is saved until "Use this
 * routine"; Adjust opens one step and comes straight back here.
 */
export function ReviewStep({
  draft,
  saving,
  onAccept,
  onAdjust,
}: {
  draft: OnboardingDraft;
  saving: boolean;
  onAccept: (review: Review) => void;
  onAdjust: (step: Exclude<OnboardingStep, 'review'>) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    let live = true;
    personalisation
      .review(draft)
      .then((r) => live && setReview(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft]);

  if (!review) return null;
  const { plan, preview, changes } = review;
  const hasGoals = plan.goals.length > 0;

  return (
    <>
      <Section title="Your Terbit plan" footer={hasGoals ? undefined : 'No goals yet: your Main Wake-Up rings without a mission. Add goals with Adjust.'}>
        {plan.goals.map((g) => (
          <ListRow
            key={g.category}
            icon={{ ios: 'target', android: 'track_changes', web: 'track_changes' }}
            title={g.title}
            subtitle={`${g.goal} · ${COMPLETION_MODE_LABEL[g.mode]} · ${DAY_PART_LABEL[g.part]}`}
          />
        ))}
        {!hasGoals && <ListRow icon={{ ios: 'target', android: 'track_changes', web: 'track_changes' }} title="Wake-up routine only" />}
      </Section>

      {preview.groups.map((group) => (
        <Section key={group.days} title={group.days}>
          {group.items.map((item) => (
            <ListRow
              key={`${item.time}-${item.title}`}
              icon={item.isMainWakeUp ? { ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' } : { ios: 'alarm', android: 'alarm', web: 'alarm' }}
              title={`${item.time}  ${item.title}`}
              subtitle={item.snooze ? `${item.detail}\n${item.snooze}` : item.detail}
            />
          ))}
        </Section>
      ))}

      {preview.night && (
        <Section title="Your sleep targets" footer="The Available Sleep Window is the time between your bedtime target and your Main Wake-Up. It isn’t a measure of sleep.">
          <ListRow icon={{ ios: 'moon', android: 'bedtime', web: 'bedtime' }} title={`${preview.night.windDown}  Wind-down target`} subtitle="Digital quiet time begins" />
          <ListRow icon={{ ios: 'bed.double', android: 'hotel', web: 'hotel' }} title={`${preview.night.bedtime}  Bedtime target`} subtitle="When you aim to be asleep" />
          <ListRow
            icon={{ ios: 'moon.zzz', android: 'bedtime', web: 'bedtime' }}
            title="Night Routine"
            value={preview.night.nightRoutine ? 'Uses these times' : 'Not included'}
          />
          {preview.night.availableSleepWindow.map((w) => (
            <ListRow key={w.nights} icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }} title="Available Sleep Window" subtitle={w.nights} value={w.duration} />
          ))}
        </Section>
      )}

      {changes.replacesExisting && (
        <Section
          title="What will change"
          footer={`${changes.untouched > 0 ? `Your other ${changes.untouched === 1 ? 'alarm stays' : `${changes.untouched} alarms stay`} as they are. ` : ''}Your history, XP and streak are never changed.`}>
          {changes.lines.map((line) => (
            <ListRow key={line.text} icon={{ ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' }} title={line.text} />
          ))}
        </Section>
      )}

      <View style={styles.buttons}>
        <Button title={saving ? 'Saving…' : 'Use this routine'} onPress={() => onAccept(review)} disabled={saving} />
        <Button title="Adjust" variant="secondary" onPress={() => setAdjusting(!adjusting)} disabled={saving} />
      </View>

      {adjusting && (
        <Section title="Adjust">
          {ADJUSTABLE.filter((a) => hasGoals || (a.step !== 'modes' && a.step !== 'times')).map((a) => (
            <ListRow key={a.step} icon={{ ios: 'pencil', android: 'edit', web: 'edit' }} title={a.title} subtitle={STEP_TITLE[a.step]} onPress={() => onAdjust(a.step)} />
          ))}
        </Section>
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        You can fine-tune every alarm later in the Alarms tab, and personalise again from Settings.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: Spacing.two },
  note: { paddingHorizontal: Spacing.three },
});
