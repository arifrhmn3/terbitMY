import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Spacing } from '@/constants/theme';
import { account, useAccount, useSyncStatus } from '@/features/account/account';
import { SignInForm } from '@/features/account/components/sign-in-form';
import { SyncDevPanel } from '@/features/account/components/sync-dev-panel';
import { syncStatusLabel } from '@/features/sync/status-label';
import { syncEngine } from '@/features/sync/sync';
import { useTheme } from '@/hooks/use-theme';

/** Optional account: guest/local use, email sign-in, profile, sync status, sign out, delete account. */
export default function AccountScreen() {
  const { status, user, profile } = useAccount();
  const sync = useSyncStatus();
  const label = syncStatusLabel(sync);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Account', headerLargeTitleEnabled: false }} />

      {status === 'unavailable' && (
        <Section footer="Accounts aren’t set up in this build yet. Everything works on this phone.">
          <ListRow icon={{ ios: 'iphone', android: 'smartphone', web: 'smartphone' }} title="Using Terbit MY locally" />
        </Section>
      )}

      {status === 'loading' && (
        <Section>
          <ListRow icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }} title="Loading…" />
        </Section>
      )}

      {status === 'guest' && (
        <>
          <Section>
            <ListRow
              icon={{ ios: 'iphone', android: 'smartphone', web: 'smartphone' }}
              title="Using Terbit MY locally"
              subtitle="No account needed. Your data is saved on this phone."
            />
          </Section>
          <SignInForm />
        </>
      )}

      {status === 'signed_in' && user && (
        <>
          <Section title="Account">
            <ListRow icon={{ ios: 'envelope', android: 'mail', web: 'mail' }} title="Email" value={user.email ?? '—'} />
            <ListRow
              icon={{ ios: 'icloud', android: 'cloud', web: 'cloud' }}
              title={label.title}
              subtitle={label.detail}
              onPress={() => syncEngine.sync()}
            />
          </Section>
          {/* Keyed so the field resets when the saved name changes. */}
          <DisplayName key={profile?.displayName ?? ''} current={profile?.displayName ?? ''} />
          <Section footer="Signing out keeps everything on this phone. Deleting your account removes your cloud backup and profile; this phone’s data stays unless you delete the app.">
            <ListRow
              icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
              title="Sign out"
              onPress={() =>
                Alert.alert('Sign out?', 'Your alarms, history, XP and streaks stay on this phone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', onPress: () => account.signOut().catch((e) => Alert.alert('Couldn’t sign out', String(e))) },
                ])
              }
            />
            <ListRow
              icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
              title="Delete account"
              onPress={() =>
                Alert.alert(
                  'Delete your account?',
                  'This permanently deletes your profile and cloud backup (alarms, history, XP, achievements). Data on this phone is kept.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete account',
                      style: 'destructive',
                      onPress: () =>
                        account
                          .deleteAccount()
                          .then(() => Alert.alert('Account deleted', 'You’re now using Terbit MY locally on this phone.'))
                          .catch(() => Alert.alert('Couldn’t delete the account', 'Check your connection and try again.')),
                    },
                  ],
                )
              }
            />
          </Section>
        </>
      )}

      {__DEV__ && status !== 'unavailable' && <SyncDevPanel />}
    </Screen>
  );
}

function DisplayName({ current }: { current: string }) {
  const theme = useTheme();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);

  return (
    <Section title="Display name" footer="Private for now. Shown to others only in future features you choose to use.">
      <TextInput
        value={name}
        onChangeText={setName}
        maxLength={50}
        placeholder="Your name"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Display name"
        style={[styles.input, { color: theme.text }]}
      />
      <View style={styles.actions}>
        <Button
          title={busy ? 'Saving…' : 'Save name'}
          variant="secondary"
          disabled={busy || name.trim() === current}
          onPress={async () => {
            setBusy(true);
            try {
              await account.setDisplayName(name);
            } catch {
              Alert.alert('Couldn’t save', 'Check your connection and try again.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 17,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    padding: Spacing.three,
  },
});
