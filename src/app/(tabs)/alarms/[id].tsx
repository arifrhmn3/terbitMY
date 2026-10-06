import { Stack, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { createAlarmDraft } from '@/features/alarms/alarm';
import { useAlarms } from '@/features/alarms/alarms';
import { AlarmEditor } from '@/features/alarms/components/alarm-editor';

/** Create (`/alarms/new`) or edit (`/alarms/<id>`) an alarm. */
export default function AlarmEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, alarms } = useAlarms();
  const isNew = id === 'new';
  const existing = alarms.find((a) => a.id === id);

  const title = isNew ? 'New alarm' : 'Edit alarm';
  const header = <Stack.Screen options={{ title, headerLargeTitleEnabled: false }} />;

  if (status !== 'ready') {
    return (
      <Screen>
        {header}
        <ThemedText themeColor="textSecondary">{status === 'error' ? 'Couldn’t load alarms.' : 'Loading…'}</ThemedText>
      </Screen>
    );
  }

  if (!isNew && !existing) {
    return (
      <Screen>
        {header}
        <ThemedText>This alarm doesn’t exist any more.</ThemedText>
      </Screen>
    );
  }

  // The first alarm becomes the main wake-up alarm by default.
  const initial = existing ?? createAlarmDraft({ isPrimary: alarms.length === 0 });

  return (
    <Screen>
      {header}
      <AlarmEditor key={id} initial={initial} alarmId={existing?.id} />
    </Screen>
  );
}
