import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { faith } from '@/features/faith/faith';
import { visibleTraditions } from '@/features/faith/faith-settings';
import { formatDay } from '@/features/faith/format';
import { recitationArchive, type RecitationArchiveRow } from '@/features/faith/recitation/archive';
import { TRADITION_LABEL, type FaithTradition } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';

const ARCHIVE_DAYS = 30;

/**
 * Previous days' Daily Recitations, newest first (never the future). Each
 * date opens the exact passage everyone of that tradition had that day.
 * Days not on the phone need internet to open, then are saved. Recitation
 * only: Reflection / Meditation sessions are never listed here.
 */
export default function FaithArchiveScreen() {
  const settings = useFaithSettings();
  const traditions = visibleTraditions(settings);
  const [chosen, setChosen] = useState<FaithTradition | null>(null);
  const tradition = chosen && traditions.includes(chosen) ? chosen : (traditions[0] ?? null);
  const [rows, setRows] = useState<RecitationArchiveRow[]>([]);

  useEffect(() => {
    if (!tradition) return;
    let current = true;
    recitationArchive(faith.recitation, tradition, ARCHIVE_DAYS)
      .then((r) => current && setRows(r))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [tradition]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Recitation archive', headerLargeTitleEnabled: false }} />
      {!tradition ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.center}>
            Choose your faith in Settings → Faith, or turn on Explore other faith traditions, to browse previous Daily Recitations.
          </ThemedText>
        </ThemedView>
      ) : (
        <>
          {traditions.length > 1 && (
            <Section footer="Browsing another tradition doesn’t change your own faith setting.">
              <ChoiceRow
                options={traditions.map((t) => ({ value: t, label: TRADITION_LABEL[t] }))}
                value={tradition}
                onChange={setChosen}
              />
            </Section>
          )}
          <Section
            title={`${TRADITION_LABEL[tradition]} Daily Recitation`}
            footer="Days that aren’t on this phone need internet to open; once opened they’re saved.">
            {rows.map((row) => (
              <ListRow
                key={row.date}
                icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
                title={formatDay(row.date)}
                subtitle={row.onPhone ? 'On this phone' : 'Needs internet'}
                href={{ pathname: '/alarms/faith/day', params: { date: row.date, tradition } }}
              />
            ))}
          </Section>
        </>
      )}
    </Screen>
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
