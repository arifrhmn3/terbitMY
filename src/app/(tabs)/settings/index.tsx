import Constants from 'expo-constants';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { MISSION_PACING_LABEL, MOBILITY_PROFILE_LABEL } from '@/features/accessibility/accessibility-settings';
import { useAccount, useSyncStatus } from '@/features/account/account';
import { FAITH_PREFERENCE_LABEL } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';
import { visibleSettingsGroups, type SettingsPage } from '@/features/settings/settings-index';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';
import { AUTHORIZATION_INFO } from '@/features/night/labels';
import { useNightRoutine } from '@/features/night/night';
import { syncStatusLabel } from '@/features/sync/status-label';

/** Settings: a short index; each group opens its own screen. */
export default function SettingsScreen() {
  const { status, user } = useAccount();
  const sync = useSyncStatus();
  const faithSettings = useFaithSettings();
  const { value: access } = useAccessibilitySettings();
  const night = useNightRoutine();

  // Current value or status under each row, in plain language.
  const subtitle: Record<SettingsPage, string> = {
    account:
      status === 'signed_in'
        ? `${user?.email ?? 'Signed in'} · ${syncStatusLabel(sync).title}`
        : status === 'loading'
          ? 'Loading…'
          : 'Using Terbit MY on this phone · optional sign-in',
    faith: `${faithSettings.primary ? FAITH_PREFERENCE_LABEL[faithSettings.primary] : 'Not chosen'} · Recitation and Reflection`,
    'screen-time': `For night app restrictions · ${AUTHORIZATION_INFO[night.authorization].label}`,
    notifications: 'Alarms, Gentle mode follow-ups and wind-down reminders',
    accessibility: `Mobility: ${MOBILITY_PROFILE_LABEL[access.mobilityProfile]} · Pacing: ${MISSION_PACING_LABEL[access.missionPacing]}`,
    permissions: 'Alarms, notifications, and what Terbit MY never asks for',
    privacy: 'What stays on your phone, and what’s backed up',
    developer: 'Alarm, progress, sync and plan test tools',
  };

  return (
    <Screen>
      {visibleSettingsGroups(__DEV__).map((group) => (
        <Section key={group.id} title={group.title} footer={group.footer}>
          {group.rows.map((row) => (
            <ListRow key={row.page} icon={row.icon} title={row.title} subtitle={subtitle[row.page]} href={row.href} />
          ))}
        </Section>
      ))}

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
