import { Alert } from 'react-native';

import { getAlarmService } from '@/services/alarm-scheduler';
import { getReminderService } from '@/services/notifications';

import type { AlarmDraft } from '../alarm';
import { alarmStore, handOff } from '../alarms';
import { mainWakeUpPrompt } from '../main-wake-up-prompt';
import { applyMainWakeUpChoice, mainWakeUpQuestion } from '../morning';

/**
 * Saves an alarm (new or edited) the same way everywhere (Quick Save,
 * Customise, editing): asks for notification permission the first time a
 * Gentle alarm needs it, and explains if the phone couldn't schedule the
 * alarm. Calls `onDone` once the user can move on. Throws if saving failed.
 */
export async function saveAlarm(draft: AlarmDraft, alarmId: string | undefined, onDone: () => void): Promise<void> {
  const { result } = await alarmStore.save(draft, alarmId);
  // Gentle mode follow-ups use local notifications: ask once, when it's first needed.
  if (draft.completionMode === 'gentle' && draft.enabled) await getReminderService().requestPermission();
  if (result?.status === 'permission-denied' || result?.status === 'failed') {
    // Saved in Terbit MY, but the phone couldn't schedule it.
    Alert.alert('Alarm saved, but it can’t ring yet', result.message ?? 'Terbit MY doesn’t have permission to set alarms.', [
      { text: 'OK', onPress: onDone },
      {
        text: 'Fix permissions',
        onPress: async () => {
          const service = getAlarmService();
          const status = await service.requestNativeAlarmPermission();
          if (status.permission !== 'granted') await service.openNativeAlarmSettings();
          else await alarmStore.syncNative();
          onDone();
        },
      },
    ]);
    return;
  }
  onDone();
}

/**
 * Before saving: the Main Wake-Up question for this alarm, if any (one Main
 * Wake-Up per day; see morning.ts). Resolves with the alarm to save, or null
 * if the user cancelled. Other alarms are adjusted by the store on save.
 */
export function askMainWakeUp(draft: AlarmDraft, alarmId?: string): Promise<AlarmDraft | null> {
  const question = mainWakeUpQuestion(draft, alarmStore.getState().alarms, { alarmId, now: Date.now() });
  const prompt = mainWakeUpPrompt(question, draft);
  if (!prompt) return Promise.resolve(draft);
  return new Promise((resolve) => {
    Alert.alert(
      prompt.title,
      prompt.message,
      prompt.buttons.map((b) => ({
        text: b.label,
        style: b.style,
        onPress: () => resolve(b.choice === 'cancel' ? null : applyMainWakeUpChoice(draft, b.choice)),
      })),
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/** Saves an alarm (new or edited) after the Main Wake-Up question, if any. Returns false if the user cancelled. */
export async function saveWithMainWakeUp(draft: AlarmDraft, alarmId: string | undefined, onDone: () => void): Promise<boolean> {
  const chosen = await askMainWakeUp(draft, alarmId);
  if (!chosen) return false;
  await saveAlarm(chosen, alarmId, onDone);
  // A Main Wake-Up change may leave a snooze ring that no longer applies.
  handOff.syncSnoozes().catch(() => {});
  return true;
}

/** Saves a NEW alarm after the Main Wake-Up question (if any). Returns false if the user cancelled. */
export function saveNewAlarm(draft: AlarmDraft, onDone: () => void): Promise<boolean> {
  return saveWithMainWakeUp(draft, undefined, onDone);
}
