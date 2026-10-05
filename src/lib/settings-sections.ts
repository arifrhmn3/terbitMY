import type { SymbolViewProps } from 'expo-symbols';

export type SettingsSectionId = 'notifications' | 'privacy' | 'accessibility' | 'account';

export type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  summary: string;
  icon: SymbolViewProps['name'];
  phase: number;
  plannedItems: string[];
};

export const settingsSections: SettingsSection[] = [
  {
    id: 'account',
    title: 'Account',
    summary: 'Sign in, sync and data export',
    icon: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
    phase: 2,
    plannedItems: [
      'Sign in with Apple, Google or email',
      'Sync progress across devices',
      'Export or delete your data',
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    summary: 'Reminders and circle updates',
    icon: { ios: 'bell.badge', android: 'notifications', web: 'notifications' },
    phase: 3,
    plannedItems: ['Bedtime reminders', 'Streak-at-risk nudges', 'Circle check-ins'],
  },
  {
    id: 'privacy',
    title: 'Privacy & Permissions',
    summary: 'Camera, microphone and Screen Time',
    icon: { ios: 'hand.raised', android: 'privacy_tip', web: 'privacy_tip' },
    phase: 3,
    plannedItems: [
      'See which optional permissions are granted',
      'Camera and microphone are only used during a mission',
      'Video and audio are processed on device and never uploaded',
    ],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    summary: 'Alternatives to physical missions',
    icon: { ios: 'accessibility', android: 'accessibility', web: 'accessibility' },
    phase: 3,
    plannedItems: [
      'Non-physical alternative for every mission',
      'Larger text and reduced motion support',
      'Haptic and visual alarm cues',
    ],
  },
];

export function findSettingsSection(id: string): SettingsSection | undefined {
  return settingsSections.find((section) => section.id === id);
}
