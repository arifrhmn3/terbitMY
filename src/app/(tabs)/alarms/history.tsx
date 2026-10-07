import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { occurrences } from '@/features/alarms/alarms';
import { toHistoryEntry, type HistoryEntry } from '@/features/alarms/history';
import { useTheme } from '@/hooks/use-theme';

/** The last 30 alarm occurrences saved on this phone, newest first. */
export default function RecentMorningsScreen() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      occurrences.listRecent().then((list) => active && setEntries(list.map(toHistoryEntry)));
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Recent mornings', headerLargeTitleEnabled: false }} />
      <Section footer="Saved on this phone only. Simulated alarms are marked as simulations.">
        {entries === null && <Message text="Loading…" />}
        {entries?.length === 0 && <Message text="No mornings yet. Simulate an alarm from an alarm’s settings to try it." />}
        {entries?.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
      </Section>
    </Screen>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const theme = useTheme();
  const good = entry.successful;

  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <ThemedText type="headline" style={styles.flex}>
          {entry.scheduled}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: good ? theme.tint : theme.textSecondary }}>
          {entry.status}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {entry.title} · {entry.mission}
        {entry.simulated ? ' · Simulated' : ''}
      </ThemedText>
      {entry.completion && (
        <ThemedText type="small" themeColor="textSecondary">
          {entry.completion}
        </ThemedText>
      )}
    </View>
  );
}

function Message({ text }: { text: string }) {
  return (
    <ThemedText themeColor="textSecondary" style={styles.message}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  message: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
  },
});
