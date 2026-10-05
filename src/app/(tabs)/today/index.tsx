import { StyleSheet, View } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getGreeting } from '@/lib/day-part';

export default function TodayScreen() {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen>
      <View style={styles.hero}>
        <ThemedText type="caption" themeColor="textSecondary">
          {date}
        </ThemedText>
        <ThemedText type="title">{getGreeting(now)}</ThemedText>
      </View>

      <Section title="This morning">
        <ListRow
          icon={{ ios: 'alarm', android: 'alarm', web: 'alarm' }}
          title="Next alarm"
          value="Not set"
          href="/alarms"
        />
        <ListRow
          icon={{ ios: 'target', android: 'target', web: 'target' }}
          title="Morning mission"
          value="None yet"
        />
      </Section>

      <Section title="Tonight">
        <ListRow
          icon={{ ios: 'moon.zzz', android: 'bedtime', web: 'bedtime' }}
          title="Bedtime routine"
          value="Not set"
        />
      </Section>

      <ComingSoon
        phase={1}
        description="Your next alarm, today’s mission and tonight’s wind-down plan will appear here."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.one,
  },
});
