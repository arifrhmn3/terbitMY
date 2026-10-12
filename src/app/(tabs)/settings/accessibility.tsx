import { Stack } from 'expo-router';

import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  ACCESSIBILITY_POLICY,
  MISSION_PACING_LABEL,
  MISSION_PACINGS,
  MOBILITY_PROFILE_OPTIONS,
} from '@/features/accessibility/accessibility-settings';
import { preferences } from '@/features/settings/preferences';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';
import { reduceMotionStatus, SYSTEM_PREFERENCES, textSizeStatus } from '@/features/accessibility/system-preferences';
import { useReduceMotion, useTextScale } from '@/services/accessibility';

const seconds = (ms: number) => `${Math.round(ms / 1000)} seconds`;

/**
 * Accessibility: your Mobility Profile (which Fitness activities you see),
 * how much time missions give you to get ready, and how Terbit MY follows the
 * iPhone's motion and text settings. Saved on this phone; applies to every alarm.
 */
export default function AccessibilitySettingsScreen() {
  const { value } = useAccessibilitySettings();
  const reduceMotion = useReduceMotion();
  const textScale = useTextScale();
  const update = (change: Parameters<typeof preferences.accessibility.update>[0]) => {
    preferences.accessibility.update(change).catch(() => {});
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Accessibility', headerLargeTitleEnabled: false }} />

      <Section
        title="Mobility Profile"
        footer="Choose what suits you; you can change it any time. Your Fitness alarms and practice show the activities for your profile, and every profile earns the same XP. General activities, not medical advice: go at your own pace and stop if anything hurts.">
        {MOBILITY_PROFILE_OPTIONS.map((option) => (
          <ListRow
            key={option.value}
            icon={
              value.mobilityProfile === option.value
                ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
            }
            title={option.label}
            subtitle={option.description}
            onPress={() => update({ mobilityProfile: option.value })}
          />
        ))}
      </Section>

      <Section
        title="Mission pacing"
        footer={`More time to get ready before a Fitness activity starts: ${seconds(ACCESSIBILITY_POLICY.fitnessCountdownMs.normal)} (Normal) or ${seconds(ACCESSIBILITY_POLICY.fitnessCountdownMs.extended)} (Extended). Targets stay the same. Other missions have no time limit.`}>
        <ChoiceRow
          options={MISSION_PACINGS.map((p) => ({ value: p, label: MISSION_PACING_LABEL[p] }))}
          value={value.missionPacing}
          onChange={(missionPacing) => update({ missionPacing })}
        />
      </Section>

      {/* iPhone preferences Terbit MY follows automatically: read-only, never a permission, no button. */}
      <Section
        title="Motion and text"
        footer="These aren’t permissions: Terbit MY follows your iPhone’s settings automatically, and there’s nothing to allow. Change them in the iPhone Settings app.">
        <ListRow
          icon={{ ios: 'figure.walk.motion', android: 'animation', web: 'animation' }}
          title={SYSTEM_PREFERENCES.reduce_motion.title}
          subtitle={`${SYSTEM_PREFERENCES.reduce_motion.effect} Change it in ${SYSTEM_PREFERENCES.reduce_motion.iphonePath}.`}
          value={reduceMotionStatus(reduceMotion)}
        />
        <ListRow
          icon={{ ios: 'textformat.size', android: 'format_size', web: 'format_size' }}
          title={SYSTEM_PREFERENCES.larger_text.title}
          subtitle={`${SYSTEM_PREFERENCES.larger_text.effect} Change it in ${SYSTEM_PREFERENCES.larger_text.iphonePath}. ${SYSTEM_PREFERENCES.larger_text.alsoPath}.`}
          value={textSizeStatus(textScale)}
        />
      </Section>
    </Screen>
  );
}
