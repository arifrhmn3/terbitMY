import { Stack } from 'expo-router';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { categoriesFor, missionChoices, practiceParams } from '@/features/alarms/creation';
import { useFaithSettings } from '@/features/faith/use-faith';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';

/** Practice: try any mission from the same catalogues as alarm creation. No alarm rings and no XP is earned. */
export default function PracticeHubScreen() {
  const faith = useFaithSettings();
  const { value: access } = useAccessibilitySettings();
  const context = { mobilityProfile: access.mobilityProfile, faith };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Practice', headerLargeTitleEnabled: false }} />
      {categoriesFor(context).map((category) => (
        <Section
          key={category.id}
          title={category.title}
          footer={category.id === 'faith' ? 'Today’s Recitation and the Recitation archive are in Faith below.' : undefined}>
          {missionChoices(category.id, context).map((choice) => (
            <ListRow
              key={choice.id}
              icon={category.icon}
              title={choice.title}
              subtitle={choice.subtitle}
              href={{ pathname: '/alarms/practice', params: practiceParams(choice.mission) }}
            />
          ))}
          {category.id === 'faith' && (
            <ListRow
              icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
              title="Faith"
              subtitle="Today’s Recitation, Reflection and the archive"
              href="/alarms/faith"
            />
          )}
        </Section>
      ))}
    </Screen>
  );
}
