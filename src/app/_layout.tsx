import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useAlarmHandOff } from '@/features/alarms/use-alarm-handoff';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useAlarmHandOff();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* The alarm screen covers everything and can't be swiped away. */}
        <Stack.Screen name="alarm/[occurrenceId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
