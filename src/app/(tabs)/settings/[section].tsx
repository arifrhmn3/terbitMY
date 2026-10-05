import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { findSettingsSection } from '@/lib/settings-sections';

export default function SettingsSectionScreen() {
  const { section: id } = useLocalSearchParams<{ section: string }>();
  const section = findSettingsSection(id);

  if (!section) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Settings' }} />
        <ThemedText>This settings page doesn’t exist.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: section.title, headerLargeTitleEnabled: false }} />
      <Section title="What will be here">
        {section.plannedItems.map((item) => (
          <ThemedText key={item} style={styles.item}>
            {item}
          </ThemedText>
        ))}
      </Section>
      <ComingSoon phase={section.phase} description={section.summary} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
  },
});
