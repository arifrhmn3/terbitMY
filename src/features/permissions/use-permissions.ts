import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { systemPermissions } from '@/services/permissions';

import { permissionStatuses, type PermissionId, type PermissionStatus } from './permissions';

/**
 * The current permission statuses, read (never requested) when the screen
 * opens and again when the user comes back from iPhone Settings.
 */
export function usePermissionStatuses() {
  const [statuses, setStatuses] = useState<Record<PermissionId, PermissionStatus> | null>(null);

  const refresh = useCallback(() => {
    Promise.all([systemPermissions.readAlarms(), systemPermissions.readNotifications()])
      .then(([alarms, notifications]) => setStatuses(permissionStatuses({ alarms, notifications })))
      .catch(() => {});
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { statuses, refresh };
}
