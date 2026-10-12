import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { screenAnimation, useReduceMotion } from '@/services/accessibility';

type TabStackProps = {
  /** Title shown in the large navigation header of the tab's first screen. */
  title: string;
};

/**
 * Each tab owns a native stack so it can push detail screens while keeping
 * the tab bar visible, and shows an iOS-style collapsing large title.
 * With Reduce Motion on, screens fade instead of sliding.
 */
export function TabStack({ title }: TabStackProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <Stack
      screenOptions={{
        animation: screenAnimation(reduceMotion),
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
