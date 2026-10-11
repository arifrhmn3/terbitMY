import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

type NoticeProps = {
  title: string;
  description: string;
};

/** A highlighted card for important status, such as a feature that isn't working yet. */
export function Notice({ title, description }: NoticeProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card} accessibilityRole="summary">
      <ThemedText type="smallBold" themeColor="tint">
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
