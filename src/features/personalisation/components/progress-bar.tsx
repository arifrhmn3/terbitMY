import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A thin, calm progress bar (no "Step 3 of 7" counting). */
export function ProgressBar({ fraction }: { fraction: number }) {
  const theme = useTheme();
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.fill, { width: `${Math.max(4, percent)}%`, backgroundColor: theme.tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: Radius.card, overflow: 'hidden' },
  fill: { height: 4, borderRadius: Radius.card },
});
