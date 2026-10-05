import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { tabs } from '@/lib/tabs';

export default function AppTabs() {
  const theme = useTheme();

  return (
    <NativeTabs
      tintColor={theme.tint}
      backgroundColor={process.env.EXPO_OS === 'android' ? theme.backgroundElement : undefined}
      indicatorColor={theme.backgroundSelected}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
