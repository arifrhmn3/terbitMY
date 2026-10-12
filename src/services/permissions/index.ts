import { Linking } from 'react-native';

import { getAlarmService, type NativeAlarmStatus } from '../alarm-scheduler';
import { getReminderService, type ReminderPermission } from '../notifications';

/**
 * System permissions Terbit MY uses, read as the platform reports them.
 * Reading never asks; asking happens only through `request…` calls, made
 * when the user taps (contextual), never all at once. Microphone and camera
 * are deliberately absent: Terbit MY doesn't use them.
 */
export const systemPermissions = {
  async readAlarms(): Promise<NativeAlarmStatus['permission']> {
    return (await getAlarmService().getNativeAlarmStatus().catch(() => null))?.permission ?? 'unavailable';
  },
  async requestAlarms(): Promise<NativeAlarmStatus['permission']> {
    return (await getAlarmService().requestNativeAlarmPermission().catch(() => null))?.permission ?? 'unavailable';
  },
  async readNotifications(): Promise<ReminderPermission> {
    return getReminderService().getPermission();
  },
  async requestNotifications(): Promise<ReminderPermission> {
    return getReminderService().requestPermission();
  },
  /** Opens Terbit MY's page in the iPhone Settings app (the supported public API; no private deep links). */
  async openSettings(): Promise<void> {
    await Linking.openSettings();
  },
};
