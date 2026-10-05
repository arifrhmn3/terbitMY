import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';

export default function ProgressScreen() {
  return (
    <Screen>
      <Section title="Discipline">
        <ListRow icon={{ ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' }} title="Current streak" value="0 days" />
        <ListRow icon={{ ios: 'star', android: 'star', web: 'star' }} title="XP" value="0" />
        <ListRow icon={{ ios: 'rosette', android: 'military_tech', web: 'military_tech' }} title="Rank" value="Novice" />
      </Section>

      <Section title="Sleep">
        <ListRow icon={{ ios: 'bed.double', android: 'bed', web: 'bed' }} title="Bedtime consistency" value="—" />
        <ListRow icon={{ ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' }} title="Average wake-up" value="—" />
      </Section>

      <ComingSoon phase={2} description="XP, streaks and ranks start counting once you complete your first mission." />
    </Screen>
  );
}
