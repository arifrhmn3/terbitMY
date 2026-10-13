import { Linking } from 'react-native';

import { getAlarmService, type NativeAlarmStatus } from '../alarm-scheduler';
import { getReminderService, type ReminderPermission } from '../notifications';
import { cameraPermission, getPoseCamera, type CameraPermission } from '../pose';

/**
 * System permissions Terbit MY uses, read as the platform reports them.
 * Reading never asks; asking happens only through `request…` calls, made
 * when the user taps (contextual), never all at once. The microphone is
 * deliberately absent (not used). The camera is only read here: it's asked
 * for from a Fitness mission ("Verify with camera"), never from Settings.
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
  async readCamera(): Promise<CameraPermission> {
    return cameraPermission(await getPoseCamera().getAvailability());
  },
  /** Opens Terbit MY's page in the iPhone Settings app (the supported public API; no private deep links). */
  async openSettings(): Promise<void> {
    await Linking.openSettings();
  },
};
