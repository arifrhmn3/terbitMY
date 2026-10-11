import { Alert, StyleSheet } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { occurrences } from '@/features/alarms/alarms';
import { DuplicateOccurrenceError } from '@/features/alarms/occurrence-repository';

import { exampleWeek } from '../example-mornings';
import { progress } from '../progress';
import type { ProgressSummary } from '../progression';

/**
 * DEVELOPER TEST TOOL (development builds only). Inspects the local
 * progression state, resets it, or seeds a week of example mornings.
 */
export function ProgressDevPanel({ summary, onChange }: { summary: ProgressSummary | null; onChange: () => void }) {
  async function seed() {
    const week = exampleWeek(Date.now());
    // Make sure the example days count even after a reset.
    const start = await progress.historyStart();
    if (start > week[0].scheduledAt) await progress.reset(week[0].scheduledAt);
    let added = 0;
    for (const o of week) {
      try {
        await occurrences.insertForTesting(o);
        added += 1;
      } catch (error) {
        if (!(error instanceof DuplicateOccurrenceError)) throw error;
      }
    }
    await progress.sync();
    onChange();
    Alert.alert('Example week added', `${added} example mornings added (simulated, shown in Recent mornings).`);
  }

  function reset() {
    Alert.alert('Reset progress?', 'Clears XP and achievements. Earlier mornings stay in history but stop counting.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await progress.reset();
          onChange();
        },
      },
    ]);
  }

  const unlocked = summary?.achievements.filter((a) => a.unlock).length ?? 0;
  return (
    <Section title="Progress (developer)" footer="Development builds only. Not shown in release builds.">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {summary
          ? `XP ${summary.totalXp} · achievements ${unlocked}/${summary.achievements.length} · streak ${summary.streak.current} (longest ${summary.streak.longest}) · last success ${summary.streak.lastSuccessfulDay ?? '—'} · ${summary.successfulMornings}/${summary.trackedMornings} mornings`
          : 'Loading…'}
      </ThemedText>
      <ListRow icon={{ ios: 'calendar.badge.plus', android: 'calendar_add_on', web: 'calendar_add_on' }} title="Seed example week" onPress={seed} />
      <ListRow icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt', web: 'restart_alt' }} title="Reset progress" onPress={reset} />
    </Section>
  );
}

const styles = StyleSheet.create({
  text: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
