import { Stack, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useFaithSettings } from '@/features/faith/use-faith';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';
import { showToday } from '@/features/today/navigation';

import { createAlarmDraft } from '../alarm';
import { useAlarms } from '../alarms';
import { draftFromCreation, findChoice, isMissionCategory } from '../creation';
import { AlarmEditor } from './alarm-editor';

type EditorParams = {
  id: string;
  /** From the creation flow ("Customise"): the chosen category, mission and time. */
  category?: string;
  choice?: string;
  hour?: string;
  minute?: string;
};

const clockPart = (value: string | undefined, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/**
 * Create, customise or edit an alarm. Used by the Alarms tab (Customise and
 * Manage alarms) and by Today (tapping a scheduled alarm), so each opens it
 * in its own tab.
 */
export function AlarmEditorScreen() {
  const params = useLocalSearchParams<EditorParams>();
  const { status, alarms } = useAlarms();
  const faith = useFaithSettings();
  const { value: access, loaded } = useAccessibilitySettings();
  const isNew = params.id === 'new';
  const existing = alarms.find((a) => a.id === params.id);

  const hour = clockPart(params.hour, 23);
  const minute = clockPart(params.minute, 59);
  const choice =
    isNew && isMissionCategory(params.category) && params.choice
      ? findChoice(params.category, params.choice, { mobilityProfile: access.mobilityProfile, faith })
      : null;
  // Customise from the creation flow: a chosen mission (or none) and a time.
  const chosenMission = isNew && params.category === 'none' ? ({ type: 'none' } as const) : (choice?.mission ?? null);
  const customising = chosenMission !== null && hour !== null && minute !== null;

  const title = existing ? 'Edit alarm' : customising ? 'Customise' : 'New alarm';
  const header = <Stack.Screen options={{ title, headerLargeTitleEnabled: false }} />;

  if (status !== 'ready' || !loaded) {
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

  const initial =
    existing ??
    (customising
      ? draftFromCreation({ mission: chosenMission, hour, minute })
      : createAlarmDraft());

  return (
    <Screen>
      {header}
      {/* A new alarm is saved, then Today shows it; edits go back to where they came from. */}
      <AlarmEditor key={params.id} initial={initial} alarmId={existing?.id} onDone={existing ? undefined : showToday} />
    </Screen>
  );
}
