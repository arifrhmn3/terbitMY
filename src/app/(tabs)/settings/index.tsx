import Constants from 'expo-constants';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { useAccount, useSyncStatus } from '@/features/account/account';
import { FAITH_PREFERENCE_LABEL } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';
import { syncStatusLabel } from '@/features/sync/status-label';
import { settingsSections } from '@/lib/settings-sections';

export default function SettingsScreen() {
  const { status, user } = useAccount();
  const sync = useSyncStatus();
  const faithSettings = useFaithSettings();
  const subtitle =
    status === 'signed_in'
      ? `${user?.email ?? 'Signed in'} · ${syncStatusLabel(sync).title}`
      : status === 'loading'
        ? 'Loading…'
        : 'Using Terbit MY locally';

  return (
    <Screen>
      <Section>
        <ListRow
          icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
          title="Account"
          subtitle={subtitle}
          href="/settings/account"
        />
        <ListRow
          icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
          title="Faith"
          subtitle={faithSettings.primary ? FAITH_PREFERENCE_LABEL[faithSettings.primary] : 'Recitation and Reflection settings'}
          href="/settings/faith"
        />
      </Section>

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
