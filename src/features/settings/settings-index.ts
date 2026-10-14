import type { SymbolViewProps } from 'expo-symbols';

/** Every Settings sub-screen. Each setting lives on exactly one of them. */
export type SettingsPage = 'account' | 'personalise' | 'faith' | 'screen-time' | 'notifications' | 'accessibility' | 'permissions' | 'privacy' | 'developer';

export type SettingsRow = {
  page: SettingsPage;
  title: string;
  /** The route the row opens. */
  href: `/settings/${SettingsPage}`;
  icon: SymbolViewProps['name'];
  /** Shown only in development builds. */
  devOnly?: boolean;
};

export type SettingsGroup = { id: string; title: string; footer?: string; rows: SettingsRow[] };

const row = (page: SettingsPage, title: string, icon: SymbolViewProps['name'], devOnly = false): SettingsRow => ({
  page,
  title,
  href: `/settings/${page}`,
  icon,
  ...(devOnly ? { devOnly } : {}),
});

/**
 * The Settings tab: a short index of groups. What each setting does is on
 * its own sub-screen.
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'account',
    title: 'Account',
    rows: [row('account', 'Account & backup', { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' })],
  },
  {
    id: 'alarms_missions',
    title: 'Alarms & missions',
    footer: 'Each alarm’s time, mission and mode are set on the alarm itself (Alarms tab).',
    rows: [
      row('personalise', 'Personalise Terbit', { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }),
      row('faith', 'Faith', { ios: 'book', android: 'menu_book', web: 'menu_book' }),
    ],
  },
  {
    id: 'night',
    title: 'Night & Screen Time',
    footer: 'Your Night Routine itself (times, apps, activity) is in Alarms → Night Routine.',
    rows: [row('screen-time', 'Screen Time access', { ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' })],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    rows: [row('notifications', 'Reminders', { ios: 'bell.badge', android: 'notifications', web: 'notifications' })],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    rows: [row('accessibility', 'Missions, motion & text', { ios: 'accessibility', android: 'accessibility', web: 'accessibility' })],
  },
  {
    id: 'privacy',
    title: 'Privacy & data',
    rows: [
      row('permissions', 'Permissions', { ios: 'hand.raised', android: 'privacy_tip', web: 'privacy_tip' }),
      row('privacy', 'Your data', { ios: 'lock.shield', android: 'shield', web: 'shield' }),
    ],
  },
  {
    id: 'developer',
    title: 'Developer',
    footer: 'Development builds only. Never shown in the App Store version.',
    rows: [row('developer', 'Developer tools', { ios: 'hammer', android: 'build', web: 'build' }, true)],
  },
];

/** The groups to show: developer rows (and an empty Developer group) only in development builds. */
export function visibleSettingsGroups(isDevelopmentBuild: boolean): SettingsGroup[] {
  return SETTINGS_GROUPS.map((g) => ({ ...g, rows: g.rows.filter((r) => isDevelopmentBuild || !r.devOnly) })).filter(
    (g) => g.rows.length > 0,
  );
}
