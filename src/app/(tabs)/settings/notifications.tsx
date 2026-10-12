import { Stack } from 'expo-router';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { MODE_POLICIES } from '@/features/alarms/accountability';
import { COMPLETION_MODES } from '@/features/alarms/alarm';
import { NOTIFICATIONS } from '@/features/notifications/notification-catalogue';
import { STATUS_LABEL } from '@/features/permissions/permissions';
import { usePermissionStatuses } from '@/features/permissions/use-permissions';

const MODE_REMINDER: Record<(typeof COMPLETION_MODES)[number], string> = {
  reward: 'No follow-up reminder.',
  gentle: 'A follow-up reminder if the mission isn’t done, after the delay set on the alarm.',
  challenge: 'No follow-up reminder: the alarm leads straight into the mission.',
};

/**
 * What Terbit MY can alert you about. Nothing here is a switch: alarms
 * always ring, and Gentle follow-ups are part of Gentle mode (choose Reward
 * or Challenge on an alarm to avoid them). Planned notifications are listed
 * until they exist.
 */
export default function NotificationSettingsScreen() {
  const { statuses } = usePermissionStatuses();
  const permission = statuses?.notifications ?? null;
  const alarm = NOTIFICATIONS.find((n) => n.id === 'alarm')!;
  const gentle = NOTIFICATIONS.find((n) => n.id === 'gentleFollowUp')!;
  const planned = NOTIFICATIONS.filter((n) => n.status === 'planned');

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Reminders', headerLargeTitleEnabled: false }} />

      <Section title="Alarms" footer={alarm.description}>
        <ListRow icon={{ ios: 'alarm', android: 'alarm', web: 'alarm' }} title="Alarms always ring" href="/settings/permissions" />
      </Section>

      <Section
        title="Follow-ups by mode"
        footer={`${gentle.description} To avoid follow-ups on an alarm, choose Reward or Challenge for it.`}>
        {COMPLETION_MODES.map((mode) => (
          <ListRow
            key={mode}
            icon={{ ios: mode === 'gentle' ? 'bell' : 'bell.slash', android: 'notifications', web: 'notifications' }}
            title={MODE_POLICIES[mode].label}
            subtitle={MODE_REMINDER[mode]}
          />
        ))}
        <ListRow
          icon={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
          title="Notification permission"
          subtitle={
            permission === 'denied'
              ? 'Turned off in iPhone Settings, so Gentle follow-ups can’t arrive.'
              : 'Gentle follow-ups need it.'
          }
          value={permission ? STATUS_LABEL[permission] : 'Checking…'}
          href="/settings/permissions"
        />
      </Section>

      <Section title="Planned" footer="Not built yet. They’ll be optional and off unless you turn them on.">
        {planned.map((n) => (
          <ListRow
            key={n.id}
            icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
            title={n.title}
            subtitle={n.description}
            value="Later"
          />
        ))}
      </Section>
    </Screen>
  );
}
