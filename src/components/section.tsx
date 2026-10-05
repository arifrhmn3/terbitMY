import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionProps = {
  title?: string;
  footer?: string;
  children: ReactNode;
};

/** An inset grouped list section, in the style of iOS Settings. */
export function Section({ title, footer, children }: SectionProps) {
  const theme = useTheme();
  const rows = Children.toArray(children);

  return (
    <View style={styles.container}>
      {title && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.label} accessibilityRole="header">
          {title}
        </ThemedText>
      )}
      <ThemedView type="backgroundElement" style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <View style={[styles.separator, { backgroundColor: theme.separator }]} />
            )}
            {row}
          </Fragment>
        ))}
      </ThemedView>
      {footer && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {footer}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  label: {
    paddingHorizontal: Spacing.three,
  },
  card: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 28 + Spacing.three,
  },
});
