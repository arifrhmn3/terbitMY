import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { circles } from '@/features/circles/circles';
import { NameForm } from '@/features/circles/components/name-form';
import { memberCountLabel, memberRowLabel, roleLabel } from '@/features/circles/labels';
import { CIRCLE_MESSAGES } from '@/features/circles/messages';
import { useCircles } from '@/features/circles/use-circles';
import { formatInviteCode, inviteExpiryLabel, inviteShareMessage, isInviteExpired } from '@/features/circles/validation';
import { shareText } from '@/services/sharing';

/** One Circle: its members (Circle display names only), the invite (owner), rename/delete (owner) or leave (member). */
export default function CircleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useCircles();
  const summary = state.circles.find((c) => c.id === id) ?? null;
  const detail = state.details[id] ?? null;
  const invite = state.invites[id] ?? null;
  const isOwner = summary?.role === 'owner';
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      circles.loadCircle(id).then((outcome) => {
        if (!active) return;
        if (!outcome.ok) return setProblem(outcome.message);
        setProblem(null);
        setGone(outcome.gone);
        if (!outcome.gone && circles.getState().circles.find((c) => c.id === id)?.role === 'owner') {
          circles.invite(id);
        }
      });
      return () => {
        active = false;
      };
    }, [id]),
  );

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, then?: () => void) {
    setBusy(true);
    const outcome = await action();
    setBusy(false);
    if (outcome.ok) then?.();
    else Alert.alert('Couldn’t do that', outcome.message);
  }

  if (gone || (!summary && !detail)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Circle', headerLargeTitleEnabled: false }} />
        {gone ? (
          <Notice title="Circle not available" description={CIRCLE_MESSAGES.gone} />
        ) : problem ? (
          <Notice title="Circle unavailable" description={problem} />
        ) : (
          <Section>
            <ListRow icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }} title="Loading…" />
          </Section>
        )}
      </Screen>
    );
  }

  const circle = summary ?? detail!.circle;
  const members = detail?.members ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: circle.name, headerLargeTitleEnabled: false }} />

      {problem && <Notice title="Not up to date" description={problem} />}

      <Section>
        <ListRow icon={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }} title={circle.name} subtitle={memberCountLabel(circle.memberCount)} />
        <ListRow icon={{ ios: 'person.badge.key', android: 'key', web: 'key' }} title="Your role" value={roleLabel(circle.role)} />
      </Section>

      <Section title="Members" footer="Members see each other’s Circles name only. No activity is shared in Circles yet.">
        {members.length === 0 ? (
          <ListRow icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }} title="Loading members…" />
        ) : (
          members.map((m) => {
            const label = memberRowLabel(m, state.userId);
            return (
              <ListRow
                key={m.userId}
                icon={{ ios: m.role === 'owner' ? 'crown' : 'person.crop.circle', android: m.role === 'owner' ? 'star' : 'account_circle', web: 'account_circle' }}
                title={label.title}
                subtitle={label.subtitle}
              />
            );
          })
        )}
      </Section>

      {isOwner && (
        <Section
          title="Invite"
          footer="Anyone with this code can join for 7 days. Share it only with people you trust. A new code stops the old one working.">
          {invite ? (
            <ListRow
              icon={{ ios: 'number', android: 'pin', web: 'pin' }}
              title={formatInviteCode(invite.code)}
              value={inviteExpiryLabel(invite.expiresAt)}
            />
          ) : (
            <ListRow icon={{ ios: 'number', android: 'pin', web: 'pin' }} title="Invite code" value={problem ? 'Needs internet' : 'Loading…'} />
          )}
          {invite && !isInviteExpired(invite.expiresAt) && (
            <ListRow
              icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
              title="Share invite"
              onPress={() => shareText(inviteShareMessage(circle.name, invite.code))}
            />
          )}
          <ListRow
            icon={{ ios: 'arrow.triangle.2.circlepath', android: 'autorenew', web: 'autorenew' }}
            title={invite && isInviteExpired(invite.expiresAt) ? 'Get a new code' : 'New code'}
            onPress={() =>
              busy ||
              Alert.alert('Get a new code?', 'The current code will stop working. People already in the Circle stay in it.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'New code', onPress: () => run(() => circles.newInvite(id)) },
              ])
            }
          />
        </Section>
      )}

      {isOwner && renaming && (
        <NameForm
          title="Rename Circle"
          label="Circle name"
          placeholder="Circle name"
          initial={circle.name}
          submitTitle="Save"
          busyTitle="Saving…"
          onSubmit={async (name) => {
            const outcome = await circles.rename(id, name);
            if (outcome.ok) setRenaming(false);
            return outcome;
          }}
        />
      )}

      {isOwner ? (
        <Section footer="Deleting removes the Circle for everyone in it. Nobody’s alarms, progress or account is affected. To stop being the owner without deleting, ownership transfer will come later.">
          {!renaming && (
            <ListRow icon={{ ios: 'pencil', android: 'edit', web: 'edit' }} title="Rename Circle" onPress={() => setRenaming(true)} />
          )}
          <ListRow
            icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
            title="Delete Circle"
            onPress={() =>
              busy ||
              Alert.alert(
                `Delete “${circle.name}”?`,
                `This removes the Circle and its invite code for all ${memberCountLabel(circle.memberCount)}. Nobody’s alarms, progress or account is affected.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete Circle', style: 'destructive', onPress: () => run(() => circles.dissolve(id), () => router.back()) },
                ],
              )
            }
          />
        </Section>
      ) : (
        <Section footer="Leaving removes you from this Circle only. Your alarms and progress aren’t affected. You can rejoin with a new invite code.">
          <ListRow
            icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
            title="Leave Circle"
            onPress={() =>
              busy ||
              Alert.alert(`Leave “${circle.name}”?`, 'You can rejoin later with an invite code.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => run(() => circles.leave(id), () => router.back()) },
              ])
            }
          />
        </Section>
      )}
    </Screen>
  );
}
