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

export default function AlarmsScreen() {
  const { status, alarms } = useAlarms();

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

      <Section
        title="Wake-up missions"
        footer="Pick a mission that must be completed before the alarm can be dismissed.">
        <ListRow
          icon={{ ios: 'function', android: 'calculate', web: 'calculate' }}
          title="Maths & quiz"
          subtitle="Solve problems to prove you’re awake. Tap to practise."
          href="/alarms/practice"
        />
        <ListRow
          icon={{ ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' }}
          title="Fitness"
          subtitle="Squats or jumping jacks, counted on device"
        />
        <ListRow
          icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
          title="Recitation & reflection"
          subtitle="Read or recite a passage, then reflect"
        />
      </Section>

      <ComingSoon
        phase={1}
        description="Native alarms that ring on time, even offline or on silent, are still being built. Saved alarms will start ringing once they are ready."
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
