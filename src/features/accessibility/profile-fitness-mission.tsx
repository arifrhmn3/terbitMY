import { FitnessMissionView } from '@/features/missions/fitness/fitness-mission-view';
import type { FitnessMissionConfig, FitnessMissionResult } from '@/features/missions/fitness/types';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';

import { fitnessConfigFor } from './accessibility-settings';

/**
 * A Fitness mission for this user: the activity from their Mobility
 * Profile's catalogue, with their pacing (Settings → Accessibility). Waits
 * for the saved settings, so it never starts with the wrong catalogue.
 */
export function ProfileFitnessMission({
  config,
  onComplete,
}: {
  config: FitnessMissionConfig;
  onComplete: (result: FitnessMissionResult) => void;
}) {
  const { value, loaded } = useAccessibilitySettings();
  if (!loaded) return null;
  const resolved = fitnessConfigFor(config, value);
  return <FitnessMissionView key={`${resolved.exercise}-${resolved.countdownMs}`} config={resolved} onComplete={onComplete} />;
}
