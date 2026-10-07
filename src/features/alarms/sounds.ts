import type { FeatureKey } from '@/features/entitlements/features';

/**
 * Alarm sound catalog. Each sound is basic (free) or premium, and is gated
 * by a feature key, never by scattered "is premium" checks. Only the system
 * default exists for now: no large library and no copyrighted music.
 */
export type AlarmSoundTier = 'basic' | 'premium';

export type AlarmSound = {
  id: string;
  label: string;
  tier: AlarmSoundTier;
  feature: FeatureKey;
  /** How native code plays it: the platform's default alarm sound, or a file bundled with the app (future). */
  source: { kind: 'system-default' } | { kind: 'bundled'; file: string };
};

export const DEFAULT_SOUND_ID = 'system-default';

export const ALARM_SOUNDS: readonly AlarmSound[] = [
  { id: DEFAULT_SOUND_ID, label: 'Default alarm', tier: 'basic', feature: 'basic_alarm_sounds', source: { kind: 'system-default' } },
];

export function findSound(id: string): AlarmSound {
  return ALARM_SOUNDS.find((s) => s.id === id) ?? ALARM_SOUNDS[0];
}
