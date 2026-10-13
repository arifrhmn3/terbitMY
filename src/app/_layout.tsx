import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useCloudStartup } from '@/features/account/account';
import { useAlarmHandOff } from '@/features/alarms/use-alarm-handoff';
import { useFaithPrefetch } from '@/features/faith/use-faith';
import { useNightSync } from '@/features/night/night';
import { screenAnimation, useReduceMotion } from '@/services/accessibility';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useAlarmHandOff();
  // Optional account + background backup. Never needed for alarms to work.
  useCloudStartup();
  // Keeps today's and tomorrow's Faith content on the phone, so Faith missions work offline.
  useFaithPrefetch();
  // Night Routine: re-matches the Screen Time schedule and wind-down reminders when the app opens or alarms change.
  useNightSync();
  // iOS Reduce Motion: screens (including the alarm screen) fade instead of sliding.
  const reduceMotion = useReduceMotion();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false, animation: screenAnimation(reduceMotion) }}>
        {/* The alarm screen covers everything and can't be swiped away. */}
        <Stack.Screen name="alarm/[occurrenceId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
