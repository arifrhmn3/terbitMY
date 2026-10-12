import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { faith } from '@/features/faith/faith';
import { visibleTraditions } from '@/features/faith/faith-settings';
import { formatDay } from '@/features/faith/format';
import type { ArchiveOpen } from '@/features/faith/recitation/library';
import { DevFixtureNotice, PassageCitation, PassageSections } from '@/features/faith/recitation/recitation-view';
import { isTradition, TRADITION_LABEL, type FaithTradition } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';

const isDayKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * One day's canonical Daily Recitation (today or the archive). Reading only:
 * no XP. Recitation ends here; Reflection / Meditation is a separate experience.
 */
export default function FaithDayScreen() {
  const params = useLocalSearchParams<{ date?: string; tradition?: string }>();
  const settings = useFaithSettings();
  const date = isDayKey(params.date) ? params.date : faith.today();
  const future = date > faith.today();
  // Only traditions the user can see (their own, or all with "Explore other faith traditions").
  const tradition = isTradition(params.tradition) && visibleTraditions(settings).includes(params.tradition) ? params.tradition : null;

  if (!tradition) {
    return (
      <Screen>
        <Stack.Screen options={{ title: formatDay(date), headerLargeTitleEnabled: false }} />
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.center}>Choose your faith in Settings → Faith, or turn on Explore other faith traditions, to read Daily Recitations.</ThemedText>
        </ThemedView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: formatDay(date), headerLargeTitleEnabled: false }} />
      {future ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.center}>This day isn’t available yet.</ThemedText>
        </ThemedView>
      ) : (
        <RecitationOfDay tradition={tradition} date={date} />
      )}
    </Screen>
  );
}

function RecitationOfDay({ tradition, date }: { tradition: FaithTradition; date: string }) {
  const settings = useFaithSettings();
  const [state, setState] = useState<ArchiveOpen | 'loading'>('loading');

  const fetchDay = useCallback(
    (): Promise<ArchiveOpen> => faith.recitation.open(tradition, date).catch(() => ({ status: 'not_scheduled' }) as const),
    [tradition, date],
  );

  useEffect(() => {
    let current = true;
    fetchDay().then((r) => current && setState(r));
    return () => {
      current = false;
    };
  }, [fetchDay]);

  const retry = () => {
    setState('loading');
    fetchDay().then(setState);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="caption" themeColor="textSecondary">
        Daily Recitation · {TRADITION_LABEL[tradition]}
      </ThemedText>
      {state === 'loading' && <ThemedText themeColor="textSecondary">Opening…</ThemedText>}
      {state !== 'loading' && state.status === 'ok' && (
        <>
          <ThemedText type="title" style={styles.center}>
            {state.passage.title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {state.passage.reference}
          </ThemedText>
          <DevFixtureNotice passage={state.passage} />
          <PassageSections passage={state.passage} sections={state.passage.sections} display={settings.display} />
          <PassageCitation passage={state.passage} />
        </>
      )}
      {state !== 'loading' && state.status === 'unavailable' && (
        <>
          <ThemedText style={styles.center}>This day’s passage isn’t on this phone. Connect to the internet to open it.</ThemedText>
          <Button title="Try again" variant="secondary" onPress={retry} />
        </>
      )}
      {state !== 'loading' && (state.status === 'not_scheduled' || state.status === 'future') && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          There is no Recitation for this day.
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
