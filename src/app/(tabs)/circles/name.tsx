import { router, Stack } from 'expo-router';

import { Screen } from '@/components/screen';
import { DisplayNameForm } from '@/features/circles/components/display-name-form';
import { useCircles } from '@/features/circles/use-circles';

/** Edit the shareable Circle display name. */
export default function CircleNameScreen() {
  const { identity } = useCircles();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Your name in Circles', headerLargeTitleEnabled: false }} />
      <DisplayNameForm initial={identity?.displayName ?? ''} onSaved={() => router.back()} />
    </Screen>
  );
}
