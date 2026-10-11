import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useCloudStartup } from '@/features/account/account';
import { useAlarmHandOff } from '@/features/alarms/use-alarm-handoff';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useAlarmHandOff();
  // Optional account + background backup. Never needed for alarms to work.
  useCloudStartup();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* The alarm screen covers everything and can't be swiped away. */}
        <Stack.Screen name="alarm/[occurrenceId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
