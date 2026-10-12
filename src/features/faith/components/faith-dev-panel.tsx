import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { localDayKey } from '@/features/progress/day';

import { faith } from '../faith';
import { faithDev } from '../faith-dev';
import { addDays } from '../schedule';
import { TRADITION_LABEL, type FaithTradition } from '../types';
import { useFaithDev } from '../use-faith';

const DATE_OFFSETS = [-7, -1, 0, 1, 7] as const;

/**
 * DEVELOPMENT BUILDS ONLY (rendered behind `__DEV__`). Test date (daily
 * assignment), offline and fallback-music switches, and what is on the phone
 * for that date.
 */
export function FaithDevPanel({ tradition }: { tradition: FaithTradition | null }) {
  const dev = useFaithDev();
  const [realToday] = useState(() => localDayKey(Date.now()));
  const offset = dev.date ? (DATE_OFFSETS.find((o) => addDays(realToday, o) === dev.date) ?? 0) : 0;
  const [status, setStatus] = useState('Checking…');

  // `dev` changes whenever a switch changes, so the status is read again then.
  const readStatus = useCallback(async () => {
    const day = faith.today();
    const reflection = await faith.reflectionFor(day);
    const lines = [`Date: ${day}${dev.date ? ' (test date)' : ''}`];
    if (tradition) {
      const a = await faith.recitation.assignment(tradition, day);
      const onPhone = await faith.recitation.isOnPhone(tradition, day);
      lines.push(`${TRADITION_LABEL[tradition]}: ${a ? `${a.id} → ${a.contentId}` : 'not scheduled'} · ${onPhone ? 'on phone' : 'not on phone'}`);
    }
    const offline = await faith.music.isAvailableOffline(reflection.trackId);
    lines.push(`Reflection: ${reflection.theme} · ${reflection.trackId} · ${offline ? 'on phone' : 'not on phone'}`);
    const next = await faith.nextReflection();
    lines.push(`Next session: ${next.alternate ? `alternate · ${next.promptSetId} · ${next.trackId}` : 'today’s session'}`);
    return lines.join('\n');
  }, [tradition, dev]);

  const refresh = () => readStatus().then(setStatus, () => setStatus('Couldn’t read the status.'));

  useEffect(() => {
    let current = true;
    readStatus().then(
      (text) => current && setStatus(text),
      () => current && setStatus('Couldn’t read the status.'),
    );
    return () => {
      current = false;
    };
  }, [readStatus]);

  return (
    <Section title="Faith (developer)" footer="Development builds only. These switches never affect production builds.">
      <ChoiceRow
        title="Test date"
        options={DATE_OFFSETS.map((o) => ({ value: o, label: o === 0 ? 'Today' : `${o > 0 ? '+' : ''}${o}d` }))}
        value={offset}
        onChange={(o) => faithDev.set({ date: o === 0 ? null : addDays(realToday, o) })}
      />
      <SwitchRow
        title="Force offline"
        subtitle="Remote passages and music can’t be fetched"
        value={dev.forceOffline}
        onValueChange={(forceOffline) => faithDev.set({ forceOffline })}
      />
      <SwitchRow
        title="Force fallback music"
        subtitle="Always play the bundled track"
        value={dev.forceFallbackMusic}
        onValueChange={(forceFallbackMusic) => faithDev.set({ forceFallbackMusic })}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
        {status}
      </ThemedText>
      <ListRow
        icon={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }}
        title="Prepare today and tomorrow now"
        subtitle="Fetch and save the passage and music, as the app does in the background"
        onPress={() => {
          setStatus('Preparing…');
          faith
            .prepareAhead(tradition ? [tradition] : [])
            .then(refresh)
            .catch(() => setStatus('Preparing failed.'));
        }}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  status: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontVariant: ['tabular-nums'],
  },
});
