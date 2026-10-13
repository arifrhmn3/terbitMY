import { Stack, useLocalSearchParams } from 'expo-router';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { categoriesFor, isMissionCategory, missionChoices } from '@/features/alarms/creation';
import { useFaithSettings } from '@/features/faith/use-faith';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';

const FOOTER = {
  education: 'Default: Easy, 3 questions. You can change this with Customise.',
  fitness: 'These follow your Mobility Profile (Settings → Accessibility). Default: Easy.',
  faith: 'These follow your Faith settings. Today’s passage is saved on the phone ahead of time.',
} as const;

/** Step 2: the chosen category's missions only (Fitness: the user's Mobility Profile catalogue). */
export default function ChooseMissionScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const faith = useFaithSettings();
  const { value: access, loaded } = useAccessibilitySettings();
  const context = { mobilityProfile: access.mobilityProfile, faith };

  if (!isMissionCategory(category)) {
    return (
      <Screen>
        <ThemedText>This category doesn’t exist.</ThemedText>
      </Screen>
    );
  }
  const title = categoriesFor(context).find((c) => c.id === category)?.title ?? 'Mission';
  const choices = loaded ? missionChoices(category, context) : [];

  return (
    <Screen>
      <Stack.Screen options={{ title, headerLargeTitleEnabled: false }} />
      <Section title="Choose the mission" footer={FOOTER[category]}>
        {choices.map((choice) => (
          <ListRow
            key={choice.id}
            icon={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }}
            title={choice.title}
            subtitle={choice.subtitle}
            href={{ pathname: '/alarms/create/time', params: { category, choice: choice.id } }}
          />
        ))}
      </Section>
    </Screen>
  );
}
