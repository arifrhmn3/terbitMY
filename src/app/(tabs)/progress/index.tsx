import type { SymbolViewProps } from 'expo-symbols';

import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { plural, rankDetail, xpEntryDetail, xpEntryTitle } from '@/features/progress/format';
import { CATEGORIES, CATEGORY_LABEL, PROGRESSION_POLICY, type Category } from '@/features/progress/policy';
import { useProgressSummary } from '@/features/progress/use-progress';

const CATEGORY_ICON: Record<Category, SymbolViewProps['name']> = {
  education: { ios: 'graduationcap', android: 'school', web: 'school' },
  fitness: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
  faith: { ios: 'moon.stars', android: 'nights_stay', web: 'nights_stay' },
};

/** Streaks, XP, ranks and achievements, worked out on this phone from your mornings. */
export default function ProgressScreen() {
  const { summary, error } = useProgressSummary();

  if (!summary) {
    return (
      <Screen>
        <Section>
          <ListRow
            icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }}
            title={error ? 'Couldn’t load progress' : 'Loading…'}
            subtitle={error ?? undefined}
          />
        </Section>
      </Screen>
    );
  }

  const { morning, general, ranks, xp } = summary;
  return (
    <Screen>
      <Section
        title="Mornings"
        footer="Only your Main Wake-Up Alarm counts as a morning. A day counts when its mission is completed; days without it don’t break your streak.">
        <ListRow
          icon={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
          title="Morning streak"
          value={plural(morning.streak.current, 'day')}
        />
        <ListRow
          icon={{ ios: 'flame', android: 'whatshot', web: 'whatshot' }}
          title="Longest morning streak"
          value={plural(morning.streak.longest, 'day')}
        />
        <ListRow
          icon={{ ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' }}
          title="Successful mornings"
          subtitle={morning.scheduled === 0 ? 'Mark an alarm as your Main Wake-Up Alarm to track mornings.' : undefined}
          value={`${morning.successful} of ${morning.scheduled}`}
        />
      </Section>

      <Section title="All alarms" footer="Every alarm, morning or evening: each completed mission earns XP.">
        <ListRow
          icon={{ ios: 'checkmark.circle', android: 'task_alt', web: 'task_alt' }}
          title="Missions completed"
          value={String(general.missionsCompleted)}
        />
        <ListRow
          icon={{ ios: 'alarm', android: 'alarm', web: 'alarm' }}
          title="Alarms completed"
          value={`${general.successful} of ${general.scheduled}`}
        />
      </Section>

      <Section title="XP and ranks" footer="Ranks are placeholders while names are decided.">
        <ListRow
          icon={{ ios: 'star.fill', android: 'star', web: 'star' }}
          title={`Total · ${ranks.overall.label}`}
          subtitle={rankDetail(xp.total, ranks.overall)}
          value={`${xp.total} XP`}
        />
        {CATEGORIES.map((category) => (
          <ListRow
            key={category}
            icon={CATEGORY_ICON[category]}
            title={`${CATEGORY_LABEL[category]} · ${ranks[category].label}`}
            subtitle={category === 'education' ? rankDetail(xp.byCategory[category], ranks[category]) : 'Missions coming in a later phase'}
            value={`${xp.byCategory[category]} XP`}
          />
        ))}
      </Section>

      <Section title="Achievements">
        {summary.achievements.map(({ definition, unlock }) => (
          <ListRow
            key={definition.id}
            icon={
              unlock
                ? { ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }
                : { ios: 'lock', android: 'lock', web: 'lock' }
            }
            title={definition.title}
            subtitle={
              unlock
                ? `Unlocked ${new Date(unlock.unlockedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                : definition.description
            }
            value={definition.bonusXp > 0 ? `+${definition.bonusXp} XP` : undefined}
          />
        ))}
      </Section>

      <Section title="Recent XP">
        {summary.recentXp.length === 0 ? (
          <ListRow
            icon={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            title="No XP yet"
            subtitle="Complete a morning mission to earn your first XP."
          />
        ) : (
          summary.recentXp.map((entry) => (
            <ListRow
              key={entry.key}
              icon={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
              title={xpEntryTitle(entry, PROGRESSION_POLICY)}
              subtitle={xpEntryDetail(entry)}
              value={`+${entry.amount} XP`}
            />
          ))
        )}
      </Section>

      <Section title="Sleep">
        <ListRow icon={{ ios: 'bed.double', android: 'bed', web: 'bed' }} title="Bedtime consistency" value="—" />
        <ListRow icon={{ ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' }} title="Average wake-up" value="—" />
      </Section>
      <ComingSoon phase={4} description="Sleep and bedtime insights arrive with the bedtime routine." />
    </Screen>
  );
}
