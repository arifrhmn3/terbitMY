import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Linking } from 'react-native';

import { systemPermissions } from '@/services/permissions';

import {
  alarmPermissionStatus,
  notificationPermissionStatus,
  PERMISSION_ORDER,
  permissionAction,
  permissionStatuses,
  STATUS_LABEL,
} from './permissions';

const root = join(__dirname, '..', '..', '..');

describe('permission status mapping', () => {
  it('maps what the platform reports, and never claims "granted" when it can’t tell', () => {
    expect(alarmPermissionStatus('granted')).toBe('granted');
    expect(alarmPermissionStatus('denied')).toBe('denied');
    expect(alarmPermissionStatus('undetermined')).toBe('not_determined');
    expect(alarmPermissionStatus('unavailable')).toBe('unavailable');
    expect(notificationPermissionStatus('granted')).toBe('granted');
    expect(notificationPermissionStatus('denied')).toBe('denied');
    expect(notificationPermissionStatus('undetermined')).toBe('not_determined');
    expect(notificationPermissionStatus('unavailable')).toBe('unavailable');
    // Older builds can't read the notification permission.
    expect(notificationPermissionStatus('unknown')).toBe('unknown');
    expect(STATUS_LABEL.unknown).not.toMatch(/allow/i);
  });

  it('denied and unknown offer Open iPhone Settings; never-asked offers to ask; nothing is asked automatically', () => {
    expect(permissionAction('notifications', 'not_determined')).toBe('request');
    expect(permissionAction('alarms', 'not_determined')).toBe('request');
    expect(permissionAction('notifications', 'denied')).toBe('open_settings');
    expect(permissionAction('notifications', 'unknown')).toBe('open_settings');
    expect(permissionAction('alarms', 'granted')).toBe('open_settings');
    expect(permissionAction('alarms', 'unavailable')).toBeNull();
  });

  it('microphone and camera are listed as not used and can never be requested; audio needs no permission', () => {
    const statuses = permissionStatuses({ alarms: 'granted', notifications: 'unknown' });
    expect(statuses).toMatchObject({ microphone: 'not_used', camera: 'not_used', audio: 'not_needed', notifications: 'unknown' });
    for (const id of ['microphone', 'camera', 'audio'] as const) {
      for (const status of ['not_determined', 'denied', 'granted', 'unknown'] as const) expect(permissionAction(id, status)).toBeNull();
    }
    expect(PERMISSION_ORDER).toEqual(['alarms', 'notifications', 'audio', 'microphone', 'camera']);
  });
});

describe('system permissions service', () => {
  it('opens Terbit MY’s page in iPhone Settings through the supported API', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await systemPermissions.openSettings();
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('has no way to ask for the microphone or camera', () => {
    expect(Object.keys(systemPermissions).sort()).toEqual(
      ['openSettings', 'readAlarms', 'readNotifications', 'requestAlarms', 'requestNotifications'].sort(),
    );
  });
});

describe('no premature microphone or camera permission', () => {
  const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  it('the iOS app declares no microphone or camera use', () => {
    const plist = JSON.stringify(appJson.expo.ios?.infoPlist ?? {});
    expect(plist).not.toMatch(/NSMicrophoneUsageDescription|NSCameraUsageDescription/);
    const audio = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-audio');
    expect(audio?.[1]).toMatchObject({ microphonePermission: false });
  });

  it('no camera package is installed', () => {
    const deps = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    expect(deps.filter((d) => /camera|vision-camera/.test(d))).toEqual([]);
  });
});
