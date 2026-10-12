import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useCloudStartup } from '@/features/account/account';
import { useAlarmHandOff } from '@/features/alarms/use-alarm-handoff';
import { useFaithPrefetch } from '@/features/faith/use-faith';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useAlarmHandOff();
  // Optional account + background backup. Never needed for alarms to work.
  useCloudStartup();
  // Keeps today's and tomorrow's Faith content on the phone, so Faith missions work offline.
  useFaithPrefetch();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* The alarm screen covers everything and can't be swiped away. */}
        <Stack.Screen name="alarm/[occurrenceId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
