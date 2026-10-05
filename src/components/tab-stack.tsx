import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

type TabStackProps = {
  /** Title shown in the large navigation header of the tab's first screen. */
  title: string;
};

/**
 * Each tab owns a native stack so it can push detail screens while keeping
 * the tab bar visible, and shows an iOS-style collapsing large title.
 */
export function TabStack({ title }: TabStackProps) {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerTransparent: process.env.EXPO_OS === 'ios',
        headerBlurEffect: 'systemChromeMaterial',
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: process.env.EXPO_OS === 'ios' ? undefined : { backgroundColor: theme.background },
        headerTintColor: theme.tint,
        headerTitleStyle: { color: theme.text },
      }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
