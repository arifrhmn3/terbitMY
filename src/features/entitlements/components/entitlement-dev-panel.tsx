import { StyleSheet } from 'react-native';

import { ChoiceRow } from '@/components/choice-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { alarmStore } from '@/features/alarms/alarms';

import type { EntitlementTier } from '../entitlement';
import { useEntitlement } from '../entitlements';
import { FEATURE_KEYS, FEATURE_LABEL } from '../features';
import { ACCESS_POLICY } from '../policy';

const tierOptions: { value: EntitlementTier; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'trial', label: 'Trial' },
  { value: 'premium', label: 'Premium' },
];

/**
 * DEVELOPER TEST TOOL (development builds only). Switches the LOCAL MOCK
 * entitlement to test feature gating. No purchases happen.
 */
export function EntitlementDevPanel() {
  const { tier, trialDaysLeft, has, setMockTier } = useEntitlement();
  const unlocked = FEATURE_KEYS.filter(has).map((f) => FEATURE_LABEL[f]);

  return (
    <Section
      title="Test plan (developer)"
      footer={`Mock entitlement for testing only; no purchases. Policy: ${ACCESS_POLICY.name}. Changing it reschedules your alarms with the modes now allowed.`}>
      <ChoiceRow
        options={tierOptions}
        value={tier}
        onChange={async (next) => {
          await setMockTier(next);
          await alarmStore.syncNative();
        }}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {tier === 'trial' && trialDaysLeft !== null ? `Trial: ${trialDaysLeft} days left. ` : ''}
        Unlocked: {unlocked.join(', ')}
      </ThemedText>
    </Section>
  );
}

const styles = StyleSheet.create({
  text: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
