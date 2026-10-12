import { StyleSheet } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { alarmStore, useAlarms } from '@/features/alarms/alarms';
import { AlarmRow } from '@/features/alarms/components/alarm-row';
import { RingingStatus } from '@/features/alarms/components/ringing-status';
import { catalogueFor, EXERCISES } from '@/features/missions/fitness/exercises';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';

export default function AlarmsScreen() {
  const { status, alarms } = useAlarms();
  const { value: access } = useAccessibilitySettings();

  return (
    <Screen>
      <RingingStatus />

      <Section title="Your alarms" footer="Alarms are saved on this phone and work without internet.">
        {status === 'error' && <Message text="Couldn’t load your alarms. Close and reopen the app to try again." />}
        {status === 'ready' && alarms.length === 0 && <Message text="No alarms yet." />}
        {alarms.map((alarm) => (
          <AlarmRow key={alarm.id} alarm={alarm} onToggle={(enabled) => alarmStore.setEnabled(alarm.id, enabled)} />
        ))}
        <ListRow
          icon={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
          title="Add alarm"
          href={{ pathname: '/alarms/[id]', params: { id: 'new' } }}
        />
      </Section>

      <Section>
        <ListRow
          icon={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }}
          title="Recent mornings"
          subtitle="Completed, dismissed and missed alarms"
          href="/alarms/history"
        />
      </Section>

      <Section
        title="Wake-up missions"
        footer="Choose a mission in each alarm’s settings. Tap to practise (no alarm, no XP).">
        <ListRow
          icon={{ ios: 'function', android: 'calculate', web: 'calculate' }}
          title="Maths"
          subtitle="Solve sums to prove you’re awake"
          href={{ pathname: '/alarms/practice', params: { mission: 'math' } }}
        />
        <ListRow
          icon={{ ios: 'questionmark.bubble', android: 'quiz', web: 'quiz' }}
          title="Quiz"
          subtitle="General Knowledge, Geography, Vocabulary or Logic"
          href={{ pathname: '/alarms/practice', params: { mission: 'quiz' } }}
        />
        <ListRow
          icon={{ ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' }}
          title="Fitness"
          subtitle={catalogueFor(access.mobilityProfile)
            .map((e) => EXERCISES[e].label)
            .join(', ')}
          href={{ pathname: '/alarms/practice', params: { mission: 'fitness' } }}
        />
        <ListRow
          icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
          title="Faith"
          subtitle="Today’s Recitation and Reflection / Meditation, and the archive"
          href="/alarms/faith"
        />
      </Section>

      <ComingSoon
        phase={1}
        description="Snooze and more alarm sounds are still to come."
      />
    </Screen>
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
  message: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
  },
});
