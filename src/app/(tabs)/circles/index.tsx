import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { circles } from '@/features/circles/circles';
import { DisplayNameForm } from '@/features/circles/components/display-name-form';
import { circleRowSubtitle, circlesNotice } from '@/features/circles/labels';
import { useCircles } from '@/features/circles/use-circles';

/**
 * Circles: private, invite-only accountability groups (Phase 5B: membership
 * only, no feed or sharing yet). Needs an account; everything else in Terbit
 * MY works without one.
 */
export default function CirclesScreen() {
  const state = useCircles();
  const { status, userId, identity, identityLoaded } = state;

  // Fetch only while Circles is on screen, never at app start-up.
  useFocusEffect(
    useCallback(() => {
      circles.refresh();
    }, []),
  );
  useEffect(() => {
    if (userId) circles.refresh();
  }, [userId]);

  if (status === 'unavailable') {
    return (
      <Screen>
        <Section footer="Circles need an account, and accounts aren’t set up in this build. Everything else works on this phone.">
          <ListRow icon={{ ios: 'person.3', android: 'groups', web: 'groups' }} title="Circles aren’t available in this build" />
        </Section>
      </Screen>
    );
  }

  if (status === 'signed_out') {
    return (
      <Screen>
        <Section footer="Circles are private groups you join by invitation, for keeping each other on track. Alarms, missions, XP, Progress, your Night Routine and camera missions all work without an account.">
          <ListRow
            icon={{ ios: 'person.3', android: 'groups', web: 'groups' }}
            title="Sign in to create or join Circles."
            subtitle="Circles need an account."
          />
          <ListRow
            icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
            title="Sign in"
            subtitle="Settings → Account"
            href="/settings/account"
          />
        </Section>
      </Screen>
    );
  }

  const notice = circlesNotice(state);
  const hasData = identityLoaded || state.circles.length > 0;

  if (!hasData) {
    return (
      <Screen>
        {notice ? (
          <>
            <Notice title={notice.title} description={notice.description} />
            <Section>
              <ListRow icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} title="Try again" onPress={() => circles.refresh()} />
            </Section>
          </>
        ) : (
          <Section>
            <ListRow icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }} title="Loading…" />
          </Section>
        )}
      </Screen>
    );
  }

  if (!identity) {
    // First visit: choose the shareable name before creating or joining.
    return (
      <Screen>
        {notice && <Notice title={notice.title} description={notice.description} />}
        <DisplayNameForm />
      </Screen>
    );
  }

  return (
    <Screen>
      {notice && <Notice title={notice.title} description={notice.description} />}

      <Section title="Your Circles">
        {state.circles.length === 0 ? (
          <ListRow
            icon={{ ios: 'person.3', android: 'groups', web: 'groups' }}
            title="No Circles yet"
            subtitle="Create one for family or friends, or join with an invite code."
          />
        ) : (
          state.circles.map((circle) => (
            <ListRow
              key={circle.id}
              icon={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
              title={circle.name}
              subtitle={circleRowSubtitle(circle)}
              href={{ pathname: '/circles/[id]', params: { id: circle.id } }}
            />
          ))
        )}
      </Section>

      <Section footer="Circles are private and invite-only. There’s no public profile or search: people see you only in Circles you join.">
        <ListRow icon={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} title="Create Circle" href="/circles/create" />
        <ListRow icon={{ ios: 'number', android: 'pin', web: 'pin' }} title="Join Circle" subtitle="With an invite code" href="/circles/join" />
      </Section>

      <Section footer="Members of your Circles see only this name. Your email, Faith settings, alarms and progress aren’t shared.">
        <ListRow
          icon={{ ios: 'person.text.rectangle', android: 'badge', web: 'badge' }}
          title="Your name in Circles"
          value={identity.displayName}
          href="/circles/name"
        />
      </Section>
    </Screen>
  );
}
