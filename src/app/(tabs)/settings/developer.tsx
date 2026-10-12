import { Stack } from 'expo-router';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SyncDevPanel } from '@/features/account/components/sync-dev-panel';
import { useAccount } from '@/features/account/account';
import { NativeAlarmTest } from '@/features/alarms/components/native-alarm-test';
import { EntitlementDevPanel } from '@/features/entitlements/components/entitlement-dev-panel';
import { ProgressDevPanel } from '@/features/progress/components/progress-dev-panel';
import { useProgressSummary } from '@/features/progress/use-progress';

/**
 * DEVELOPMENT BUILDS ONLY: the test tools in one place (native alarms,
 * plan/entitlements, progress, sync). Tools that need a specific screen stay
 * there: “Simulate alarm” in the alarm editor and the Faith test panel in
 * Practice. In production builds this screen shows nothing.
 */
export default function DeveloperScreen() {
  if (!__DEV__) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Settings' }} />
        <Section>
          <ListRow icon={{ ios: 'info.circle', android: 'info', web: 'info' }} title="Not available" />
        </Section>
      </Screen>
    );
  }
  return <DeveloperTools />;
}

function DeveloperTools() {
  const { status } = useAccount();
  const { summary, refresh } = useProgressSummary();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Developer tools', headerLargeTitleEnabled: false }} />
      <Section footer="Also in development builds: “Simulate alarm” in each saved alarm, and the Faith test panel and practice options in Alarms → Practice.">
        <ListRow icon={{ ios: 'hammer', android: 'build', web: 'build' }} title="Development build" />
      </Section>
      <NativeAlarmTest />
      <EntitlementDevPanel />
      <ProgressDevPanel summary={summary} onChange={refresh} />
      {status !== 'unavailable' && <SyncDevPanel />}
    </Screen>
  );
}
