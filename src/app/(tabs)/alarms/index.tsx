import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';

export default function AlarmsScreen() {
  return (
    <Screen>
      <Section
        title="Wake-up missions"
        footer="Pick a mission that must be completed before the alarm can be dismissed.">
        <ListRow
          icon={{ ios: 'function', android: 'calculate', web: 'calculate' }}
          title="Maths & quiz"
          subtitle="Solve problems to prove you’re awake"
        />
        <ListRow
          icon={{ ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' }}
          title="Fitness"
          subtitle="Squats or jumping jacks, counted on device"
        />
        <ListRow
          icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
          title="Recitation & reflection"
          subtitle="Read or recite a passage, then reflect"
        />
      </Section>

      <ComingSoon
        phase={1}
        description="Native alarms are scheduled on your device so they ring even when you’re offline."
      />
    </Screen>
  );
}
