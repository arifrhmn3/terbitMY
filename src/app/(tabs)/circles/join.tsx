import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { circles } from '@/features/circles/circles';
import { DisplayNameForm } from '@/features/circles/components/display-name-form';
import { CIRCLE_MESSAGES } from '@/features/circles/messages';
import { useCircles } from '@/features/circles/use-circles';
import { formatInviteCode, isCompleteInviteCode } from '@/features/circles/validation';
import { useTheme } from '@/hooks/use-theme';

/** Enter an invite code → see the Circle's name → join. Nothing about members is shown before joining. */
export default function JoinCircleScreen() {
  const theme = useTheme();
  const { identity, identityLoaded } = useCircles();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ circleName: string; alreadyMember: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setMessage(null);
    const outcome = await circles.preview(code);
    setBusy(false);
    if (outcome.ok) setPreview({ circleName: outcome.circleName, alreadyMember: outcome.alreadyMember });
    else setMessage(outcome.message);
  }

  async function join() {
    setBusy(true);
    setMessage(null);
    const outcome = await circles.join(code);
    setBusy(false);
    if (outcome.ok) router.replace({ pathname: '/circles/[id]', params: { id: outcome.circleId } });
    else setMessage(outcome.message);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Join Circle', headerLargeTitleEnabled: false }} />

      {identityLoaded && !identity ? (
        <DisplayNameForm />
      ) : !preview ? (
        <Section title="Invite code" footer="Ask the Circle’s owner for its 8-character code. Codes work for 7 days.">
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().slice(0, 9))}
            placeholder="ABCD-EFGH"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            accessibilityLabel="Invite code"
            returnKeyType="go"
            onSubmitEditing={() => isCompleteInviteCode(code) && !busy && check()}
            editable={!busy}
            style={[styles.input, { color: theme.text }]}
          />
          <View style={styles.actions}>
            {message && (
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                {message}
              </ThemedText>
            )}
            <Button title={busy ? 'Checking…' : 'Continue'} onPress={check} disabled={busy || !isCompleteInviteCode(code)} />
          </View>
        </Section>
      ) : (
        <Section
          title="Join this Circle?"
          footer="Members will see your Circles name. Your email, Faith settings, alarms and progress aren’t shared.">
          <ListRow
            icon={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
            title={preview.circleName}
            subtitle={`Code ${formatInviteCode(code)}`}
          />
          <View style={styles.actions}>
            {(message || preview.alreadyMember) && (
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                {message ?? CIRCLE_MESSAGES.alreadyMember}
              </ThemedText>
            )}
            <Button
              title={busy ? 'Joining…' : preview.alreadyMember ? 'Open Circle' : 'Join'}
              onPress={join}
              disabled={busy}
            />
            <Button
              title="Use a different code"
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setPreview(null);
                setCode('');
                setMessage(null);
              }}
            />
          </View>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 22,
    letterSpacing: 2,
    minHeight: 50,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
