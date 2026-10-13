import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { alarmStore } from '@/features/alarms/alarms';
import {
  PERMISSION_INFO,
  PERMISSION_ORDER,
  permissionAction,
  STATUS_LABEL,
  type PermissionId,
  type PermissionStatus,
} from '@/features/permissions/permissions';
import { usePermissionStatuses } from '@/features/permissions/use-permissions';
import { AUTHORIZATION_INFO } from '@/features/night/labels';
import { useNightRoutine } from '@/features/night/night';
import { systemPermissions } from '@/services/permissions';

const ICON = {
  alarms: { ios: 'alarm', android: 'alarm', web: 'alarm' },
  notifications: { ios: 'bell', android: 'notifications', web: 'notifications' },
  audio: { ios: 'speaker.wave.2', android: 'volume_up', web: 'volume_up' },
  microphone: { ios: 'mic.slash', android: 'mic_off', web: 'mic_off' },
  camera: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
} as const;

/**
 * What Terbit MY may use, why, and its current status as the phone reports
 * it. Asking only happens when you tap (and only for permissions that were
 * never asked); otherwise the button opens Terbit MY in iPhone Settings.
 */
export default function PermissionsScreen() {
  const { statuses, refresh } = usePermissionStatuses();
  const night = useNightRoutine();

  async function request(id: PermissionId) {
    if (id === 'alarms') {
      const permission = await systemPermissions.requestAlarms();
      // Now allowed: make sure every saved alarm is scheduled.
      if (permission === 'granted') await alarmStore.syncNative().catch(() => {});
    } else if (id === 'notifications') {
      await systemPermissions.requestNotifications();
    }
    refresh();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Permissions', headerLargeTitleEnabled: false }} />
      {PERMISSION_ORDER.map((id) => (
        <PermissionCard
          key={id}
          id={id}
          status={statuses?.[id] ?? null}
          onRequest={() => void request(id)}
          onOpenSettings={() => void systemPermissions.openSettings()}
        />
      ))}
      {/* Screen Time is Apple's Family Controls authorization, not a phone permission: its own page. */}
      <Section footer="Used only to restrict the apps you choose during your Night Routine. Asked for only when you set that up.">
        <ListRow
          icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }}
          title="Screen Time access"
          value={AUTHORIZATION_INFO[night.authorization].label}
          href="/settings/screen-time"
        />
      </Section>
    </Screen>
  );
}

function PermissionCard(props: {
  id: PermissionId;
  status: PermissionStatus | null;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  const { id, status, onRequest, onOpenSettings } = props;
  const info = PERMISSION_INFO[id];
  const action = status ? permissionAction(id, status) : null;

  return (
    <Section footer={`${info.why} ${info.asked}`}>
      <ListRow icon={ICON[id]} title={info.title} value={status ? STATUS_LABEL[status] : 'Checking…'} />
      {action && (
        <View style={styles.action}>
          {action === 'request' ? (
            <Button title={`Allow ${info.title.toLowerCase()}`} variant="secondary" onPress={onRequest} />
          ) : (
            <Button title="Open iPhone Settings" variant="secondary" onPress={onOpenSettings} />
          )}
          {status === 'unknown' && (
            <ThemedText type="small" themeColor="textSecondary">
              Install the latest Terbit MY build to see this status here.
            </ThemedText>
          )}
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  action: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
