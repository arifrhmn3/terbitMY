import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Spacing } from '@/constants/theme';
import { AUTHORIZATION_INFO } from '@/features/night/labels';
import { nightStore, useNightRoutine } from '@/features/night/night';
import { systemPermissions } from '@/services/permissions';

/**
 * Screen Time access (Apple's Family Controls authorization), used only for
 * night app restrictions. Not a generic phone permission: iOS asks you to
 * confirm with Face ID, Touch ID or your passcode, and you can remove it any
 * time in iPhone Settings → Screen Time. The routine itself is edited in
 * Alarms → Night Routine (never duplicated here).
 */
export default function ScreenTimeSettingsScreen() {
  const { authorization } = useNightRoutine();
  const info = AUTHORIZATION_INFO[authorization];

  useEffect(() => {
    void nightStore.refreshAuthorization();
  }, []);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Screen Time', headerLargeTitleEnabled: false }} />

      <Section title="Screen Time access" footer={info.guidance}>
        <ListRow icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }} title="Status" value={info.label} />
        {(authorization === 'not_determined' || authorization === 'denied') && (
          <View style={styles.action}>
            {authorization === 'not_determined' ? (
              <Button title="Allow Screen Time access" variant="secondary" onPress={() => void nightStore.requestAuthorization()} />
            ) : (
              <Button title="Open iPhone Settings" variant="secondary" onPress={() => void systemPermissions.openSettings()} />
            )}
          </View>
        )}
      </Section>

      <Section
        title="What Terbit MY uses it for"
        footer="Terbit MY uses Apple’s Screen Time frameworks. You choose apps in Apple’s own picker; Terbit MY receives only private tokens, never the app names or how you use them. Restrictions are applied on this phone, even with Terbit MY closed and without internet. Screen Time restricts opening apps; it doesn’t give Terbit MY control of other apps’ notifications (use an iPhone Focus, such as Sleep, for that).">
        <ListRow
          icon={{ ios: 'moon.stars', android: 'bedtime', web: 'bedtime' }}
          title="Night Routine"
          subtitle="Restrict the apps you choose from wind-down until your Main Wake-Up"
          href="/alarms/night"
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
