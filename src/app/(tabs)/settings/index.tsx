import Constants from 'expo-constants';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { settingsSections } from '@/lib/settings-sections';

export default function SettingsScreen() {
  return (
    <Screen>
      <Section>
        {settingsSections.map((section) => (
          <ListRow
            key={section.id}
            icon={section.icon}
            title={section.title}
            subtitle={section.summary}
            href={{ pathname: '/settings/[section]', params: { section: section.id } }}
          />
        ))}
      </Section>

      <Section title="About">
        <ListRow
          icon={{ ios: 'info.circle', android: 'info', web: 'info' }}
          title="Version"
          value={Constants.expoConfig?.version ?? '—'}
        />
      </Section>
    </Screen>
  );
}
