import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { COMPLETION_MODE_LABEL, describeMission, describeRepeat, describeSnooze, type AlarmMission } from '@/features/alarms/alarm';
import { ALARM_DEFAULTS } from '@/features/alarms/alarm-defaults';
import { saveNewAlarm } from '@/features/alarms/components/save-alarm';
import { TimeField } from '@/features/alarms/components/time-field';
import { draftFromCreation, findChoice, isMissionCategory } from '@/features/alarms/creation';
import { useFaithSettings } from '@/features/faith/use-faith';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';
import { showToday } from '@/features/today/navigation';

/**
 * Step 3: when. With the mission chosen, the alarm can be saved straight
 * away with the central defaults (Save Alarm), or adjusted first (Customise).
 */
export default function ChooseTimeScreen() {
  const params = useLocalSearchParams<{ category?: string; choice?: string }>();
  const faith = useFaithSettings();
  const { value: access, loaded } = useAccessibilitySettings();
  const [time, setTime] = useState({ hour: ALARM_DEFAULTS.hour, minute: ALARM_DEFAULTS.minute });
  const [saving, setSaving] = useState(false);

  const choice =
    isMissionCategory(params.category) && params.choice
      ? findChoice(params.category, params.choice, { mobilityProfile: access.mobilityProfile, faith })
      : null;
  const mission: AlarmMission | null = params.category === 'none' ? { type: 'none' } : (choice?.mission ?? null);

  if (!loaded) return null;
  if (!mission) {
    return (
      <Screen>
        <ThemedText>This mission isn’t available. Go back and choose another.</ThemedText>
      </Screen>
    );
  }

  async function quickSave(chosen: AlarmMission) {
    setSaving(true);
    try {
      // A morning alarm first asks about the Main Wake-Up; cancelling keeps you here.
      if (!(await saveNewAlarm(draftFromCreation({ mission: chosen, ...time }), showToday))) setSaving(false);
    } catch (error) {
      setSaving(false);
      Alert.alert('Couldn’t save alarm', error instanceof Error ? error.message : String(error));
    }
  }

  function customise() {
    router.push({
      pathname: '/alarms/[id]',
      params: {
        id: 'new',
        category: params.category,
        choice: params.choice,
        hour: String(time.hour),
        minute: String(time.minute),
      },
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Time', headerLargeTitleEnabled: false }} />
      <Section>
        <ListRow
          icon={{ ios: 'target', android: 'target', web: 'target' }}
          title={choice?.title ?? 'No mission'}
          subtitle={describeMission(mission)}
        />
      </Section>
      <Section title="When should it ring?" footer={`Save now with the defaults (${COMPLETION_MODE_LABEL[ALARM_DEFAULTS.completionMode]} mode, ${describeRepeat(ALARM_DEFAULTS.weekdays)}, ${describeSnooze(ALARM_DEFAULTS.snooze).toLowerCase()}), or Customise first.`}>
        <TimeField hour={time.hour} minute={time.minute} onChange={(hour, minute) => setTime({ hour, minute })} />
      </Section>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="Customise" variant="secondary" onPress={customise} disabled={saving} />
        </View>
        <View style={styles.action}>
          <Button title="Save Alarm" onPress={() => void quickSave(mission)} disabled={saving} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    flexGrow: 1,
    flexBasis: 140,
  },
});
