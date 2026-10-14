import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Spacing } from '@/constants/theme';
import { personalisation } from '@/features/personalisation/personalisation';
import type { PersonalisationState } from '@/features/personalisation/storage';

/**
 * Settings → Personalise Terbit: (re)run personalisation to update goals and
 * regenerate the suggested routine. Nothing changes until the new routine is
 * accepted; earlier generated alarms are updated, never duplicated.
 */
export default function PersonaliseSettingsScreen() {
  const [state, setState] = useState<PersonalisationState | null>(null);
  const [resumable, setResumable] = useState(false);

  useFocusEffect(
    useCallback(() => {
      personalisation.state().then(setState).catch(() => {});
      personalisation.hasDraft().then(setResumable).catch(() => {});
    }, []),
  );

  const status =
    state?.status === 'completed' && state.completedAt
      ? `Routine built on ${new Date(state.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
      : state?.status === 'skipped'
        ? 'Skipped for now'
        : 'Not personalised yet';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Personalise Terbit', headerLargeTitleEnabled: false }} />
      <Section footer="Tell Terbit what you want to achieve (Education, Fitness, Faith) and how strictly to hold you to it. Terbit suggests a weekly routine you can accept or adjust. Nothing changes until you choose “Use this routine”, and your history, XP and streak are never changed.">
        <ListRow icon={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} title="Your routine" value={status} />
      </Section>
      <View style={styles.action}>
        <Button title={resumable ? 'Continue where you left off' : state?.status === 'completed' ? 'Personalise again' : 'Build my Terbit routine'} onPress={() => router.push('/personalise')} />
      </View>
      <Section footer="Private. Gender and goals stay on this phone: never backed up, never shown in Circles. Faith keeps its own setting (Settings → Faith).">
        <ListRow icon={{ ios: 'lock', android: 'lock', web: 'lock' }} title="Your answers" value="On this phone only" />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { paddingHorizontal: Spacing.one },
});
