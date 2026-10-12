import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { faith } from '@/features/faith/faith';
import { faithMissionKinds, visibleTraditions } from '@/features/faith/faith-settings';
import { formatDay } from '@/features/faith/format';
import { REFLECTION_THEME_LABEL, type DailyReflection } from '@/features/faith/reflection/types';
import { FAITH_PREFERENCE_LABEL, TRADITION_LABEL } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';

/**
 * Faith: today's Recitation (the user's own tradition, others only with
 * "Explore other faith traditions" on) and today's Reflection / Meditation,
 * plus the Recitation archive. Reading here is practice: no alarm, no XP.
 */
export default function FaithScreen() {
  const settings = useFaithSettings();
  const traditions = visibleTraditions(settings);
  const kinds = faithMissionKinds(settings);
  const today = faith.today();
  const [reflection, setReflection] = useState<DailyReflection | null>(null);

  useEffect(() => {
    faith.reflectionFor(today).then(setReflection).catch(() => {});
  }, [today]);

  const recitationRows = traditions.map((t) => (
    <ListRow
      key={t}
      icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
      title={`Daily Recitation · ${TRADITION_LABEL[t]}`}
      subtitle="Read today’s passage"
      href={{ pathname: '/alarms/faith/day', params: { date: today, tradition: t } }}
    />
  ));
  const reflectionRow = (
    <ListRow
      key="reflection"
      icon={{ ios: 'leaf', android: 'spa', web: 'spa' }}
      title="Daily Reflection / Meditation"
      subtitle={reflection ? `${REFLECTION_THEME_LABEL[reflection.theme]} · guided session with music` : 'Guided session with music'}
      href={{ pathname: '/alarms/practice', params: { mission: 'reflection' } }}
    />
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Faith', headerLargeTitleEnabled: false }} />
      <Section
        title={`Today · ${formatDay(today)}`}
        footer="Everyone of a tradition reads the same passage each day. Your first Reflection today is today’s session; another one later today is a fresh session. Practice here earns no XP.">
        {kinds[0] === 'recitation' ? [...recitationRows, reflectionRow] : [reflectionRow, ...recitationRows]}
      </Section>
      {traditions.length > 0 && (
        <Section>
          <ListRow
            icon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
            title="Recitation archive"
            subtitle="Previous days’ Daily Recitations"
            href="/alarms/faith/archive"
          />
        </Section>
      )}
      <Section footer="Your faith setting is private. It is never shown to friends or in Circles.">
        <ListRow
          icon={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
          title="Faith settings"
          subtitle={settings.primary ? FAITH_PREFERENCE_LABEL[settings.primary] : 'Not chosen'}
          href="/settings/faith"
        />
      </Section>
    </Screen>
  );
}
