import { router, Stack } from 'expo-router';

import { Screen } from '@/components/screen';
import { circles } from '@/features/circles/circles';
import { DisplayNameForm } from '@/features/circles/components/display-name-form';
import { NameForm } from '@/features/circles/components/name-form';
import { useCircles } from '@/features/circles/use-circles';

/** Name a new Circle; the creator becomes its owner and gets an invite code. */
export default function CreateCircleScreen() {
  const { identity, identityLoaded } = useCircles();

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Create Circle', headerLargeTitleEnabled: false }} />
      {identityLoaded && !identity ? (
        <DisplayNameForm />
      ) : (
        <NameForm
          title="Circle name"
          footer="For example: Morning Crew, Family, Gym Accountability or Work Friends. Only people you invite can see or join it."
          label="Circle name"
          placeholder="Circle name"
          submitTitle="Create"
          busyTitle="Creating…"
          onSubmit={async (name) => {
            const outcome = await circles.create(name);
            if (outcome.ok) router.replace({ pathname: '/circles/[id]', params: { id: outcome.circleId } });
            return outcome;
          }}
        />
      )}
    </Screen>
  );
}
