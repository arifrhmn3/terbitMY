import type { SymbolViewProps } from 'expo-symbols';

import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ProgressDevPanel } from '@/features/progress/components/progress-dev-panel';
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
  const { summary, error, refresh } = useProgressSummary();

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

  const { streak, ranks, categoryXp } = summary;
  return (
    <Screen>
      <Section
        title="Streak"
        footer="A day counts when at least one morning mission is completed. Days without an alarm don’t break your streak.">
        <ListRow
          icon={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
          title="Current streak"
          value={plural(streak.current, 'day')}
        />
        <ListRow icon={{ ios: 'flame', android: 'whatshot', web: 'whatshot' }} title="Longest streak" value={plural(streak.longest, 'day')} />
        <ListRow
          icon={{ ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' }}
          title="Successful mornings"
          value={`${summary.successfulMornings} of ${summary.trackedMornings}`}
        />
      </Section>

      <Section title="XP and ranks" footer="Ranks are placeholders while names are decided.">
        <ListRow
          icon={{ ios: 'star.fill', android: 'star', web: 'star' }}
          title={`Total · ${ranks.overall.label}`}
          subtitle={rankDetail(summary.totalXp, ranks.overall)}
          value={`${summary.totalXp} XP`}
        />
        {CATEGORIES.map((category) => (
          <ListRow
            key={category}
            icon={CATEGORY_ICON[category]}
            title={`${CATEGORY_LABEL[category]} · ${ranks[category].label}`}
            subtitle={category === 'education' ? rankDetail(categoryXp[category], ranks[category]) : 'Missions coming in a later phase'}
            value={`${categoryXp[category]} XP`}
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

      {__DEV__ && <ProgressDevPanel summary={summary} onChange={refresh} />}
    </Screen>
  );
}
