import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { useAlarms } from '@/features/alarms/alarms';
import { RingingStatus } from '@/features/alarms/components/ringing-status';
import { categoriesFor } from '@/features/alarms/creation';
import { useFaithSettings } from '@/features/faith/use-faith';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';

/**
 * Alarms: “What do you want Terbit to hold you accountable for?” Creating an
 * alarm starts with what it's for (step 1 of the mission-first flow).
 * Existing alarms are one tap away in Manage alarms; today's alarms are on Today.
 */
export default function AlarmsScreen() {
  const { alarms } = useAlarms();
  const faith = useFaithSettings();
  const { value: access } = useAccessibilitySettings();
  const categories = categoriesFor({ mobilityProfile: access.mobilityProfile, faith });
  const enabled = alarms.filter((a) => a.enabled).length;

  return (
    <Screen>
      <RingingStatus />

      <Section title="What do you want to be accountable for?" footer="Next you choose the mission, then the time.">
        {categories.map((c) => (
          <ListRow
            key={c.id}
            icon={c.icon}
            title={c.title}
            subtitle={c.subtitle}
            href={{ pathname: '/alarms/create/[category]', params: { category: c.id } }}
          />
        ))}
      </Section>

      <Section>
        <ListRow
          icon={{ ios: 'alarm', android: 'alarm', web: 'alarm' }}
          title="Alarm without a mission"
          subtitle="Turns off straight away; no XP"
          href={{ pathname: '/alarms/create/time', params: { category: 'none' } }}
        />
      </Section>

      <Section>
        <ListRow
          icon={{ ios: 'list.bullet', android: 'list', web: 'list' }}
          title="Manage alarms"
          subtitle="Edit, turn on or off, or delete your alarms"
          value={alarms.length === 0 ? 'None yet' : `${enabled} of ${alarms.length} on`}
          href="/alarms/manage"
        />
        <ListRow
          icon={{ ios: 'play.circle', android: 'play_circle', web: 'play_circle' }}
          title="Practice"
          subtitle="Try any mission without an alarm (no XP)"
          href="/alarms/missions"
        />
      </Section>
    </Screen>
  );
}
