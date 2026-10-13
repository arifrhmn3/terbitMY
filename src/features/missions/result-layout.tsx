import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

/**
 * The shared shape of every mission result (alarm and practice):
 *
 *   Success → Mission summary → Reward → Progress → Action
 *
 * Each mission fills the summary with its own details; reward and progress
 * are the same for every mission type.
 */
export function MissionResultLayout(props: {
  title: string;
  /** One short line under the title, e.g. when you were up. */
  lead?: string;
  summary: ReactNode;
  reward?: ReactNode;
  progress?: ReactNode;
  actions: ReactNode;
}) {
  const { title, lead, summary, reward, progress, actions } = props;
  return (
    <View style={styles.container}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="title" style={styles.center} accessibilityRole="header">
          {title}
        </ThemedText>
        {lead && <ThemedText style={styles.center}>{lead}</ThemedText>}
        {summary}
      </ThemedView>
      {reward && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="caption" themeColor="textSecondary">
            Reward
          </ThemedText>
          {reward}
        </ThemedView>
      )}
      {progress && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="caption" themeColor="textSecondary">
            Progress
          </ThemedText>
          {progress}
        </ThemedView>
      )}
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
});
