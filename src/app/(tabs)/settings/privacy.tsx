import { Stack } from 'expo-router';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { useAccount } from '@/features/account/account';

/**
 * Plain-language summary of where Terbit MY keeps data and the controls
 * that exist today. In-app information, not the final Privacy Policy.
 */
export default function PrivacyScreen() {
  const { status } = useAccount();
  const signedIn = status === 'signed_in';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Your data', headerLargeTitleEnabled: false }} />

      <Section
        title="On this phone"
        footer="Alarms and missions never need the internet or an account. Your settings for accessibility and reminders stay on this phone only.">
        <ListRow
          icon={{ ios: 'iphone', android: 'smartphone', web: 'smartphone' }}
          title="Alarms, mornings and progress"
          subtitle="Saved on this phone first: alarms, mission results, XP, streaks and achievements."
        />
      </Section>

      <Section
        title="Optional account"
        footer={
          signedIn
            ? 'You’re signed in, so this phone’s data is backed up privately to your account.'
            : 'You’re using Terbit MY without an account. Nothing is backed up.'
        }>
        <ListRow
          icon={{ ios: 'icloud', android: 'cloud', web: 'cloud' }}
          title="Private cloud backup"
          subtitle="Only if you sign in: your alarms, mornings, XP, achievements and profile are backed up so only you can read them."
        />
        <ListRow
          icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
          title={signedIn ? 'Manage account, sign out or delete' : 'Sign in (optional)'}
          subtitle={
            signedIn
              ? 'Deleting your account removes your cloud backup and profile. This phone’s data stays.'
              : 'Signing in backs up what’s already on this phone.'
          }
          href="/settings/account"
        />
      </Section>

      <Section title="Faith">
        <ListRow
          icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
          title="Your faith setting is private"
          subtitle="Never shown to friends, in Circles or on any profile, and never used for analytics. If you sign in, it’s kept only in your private account backup."
          href="/settings/faith"
        />
      </Section>

      <Section title="Camera and microphone" footer="See Permissions for everything Terbit MY can ask for.">
        <ListRow
          icon={{ ios: 'video.slash', android: 'videocam_off', web: 'videocam_off' }}
          title="Not used"
          subtitle="Fitness and Recitation are self-reported. Terbit MY doesn’t use the camera or microphone, and never asks for them."
          href="/settings/permissions"
        />
      </Section>

      <Section footer="A data export may come later. This screen explains how the app works today; it isn’t the Privacy Policy.">
        <ListRow icon={{ ios: 'square.and.arrow.up', android: 'ios_share', web: 'ios_share' }} title="Export my data" value="Later" />
      </Section>
    </Screen>
  );
}
