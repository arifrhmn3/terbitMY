import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { alarmStore, useAlarms } from '@/features/alarms/alarms';
import { AlarmRow } from '@/features/alarms/components/alarm-row';
import { groupAlarmsForManage } from '@/features/alarms/manage';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';

/**
 * Every saved alarm, grouped by mission (Education, Fitness / Wake-up activity,
 * Faith, No mission) and by time within each group. Tap to edit or delete;
 * the switch turns it on or off. New alarms start from the Alarms tab.
 */
export default function ManageAlarmsScreen() {
  const { status, alarms } = useAlarms();
  const { value: access } = useAccessibilitySettings();
  const groups = groupAlarmsForManage(alarms, access.mobilityProfile);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Manage alarms', headerLargeTitleEnabled: false }} />
      {status === 'error' && <Message text="Couldn’t load your alarms. Close and reopen the app to try again." />}
      {status === 'ready' && alarms.length === 0 && <Message text="No alarms yet." />}
      {groups.map((group) => (
        <Section key={group.id} title={group.title}>
          {group.alarms.map((alarm) => (
            <AlarmRow key={alarm.id} alarm={alarm} onToggle={(enabled) => alarmStore.setEnabled(alarm.id, enabled)} />
          ))}
        </Section>
      ))}
      <Section footer="Alarms are saved on this phone and work without internet.">
        <ListRow icon={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }} title="New alarm" href="/alarms" />
      </Section>
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
