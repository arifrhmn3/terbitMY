import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { formatAlarmTime } from '@/features/alarms/alarm';
import { primaryTradition } from '@/features/faith/faith-settings';
import { TRADITION_LABEL } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';
import type { MobilityProfile } from '@/features/missions/fitness/types';
import { plural } from '@/features/progress/format';
import { useAccessibilitySettings } from '@/features/settings/use-preferences';
import { describeScheduleItem, TODAY_STATUS_LABEL } from '@/features/today/labels';
import type { MorningStatus, TodayItem } from '@/features/today/today';
import type { TonightView } from '@/features/today/tonight';
import { useToday } from '@/features/today/use-today';
import { describeRestriction, NIGHT_ACTIVITY_LABEL, NIGHT_ACTIVITY_ROUTE, tonightRow, tonightTitle } from '@/features/night/labels';
import { getGreeting } from '@/lib/day-part';
import { useTheme } from '@/hooks/use-theme';

function clockOf(at: number): string {
  const d = new Date(at);
  return formatAlarmTime({ hour: d.getHours(), minute: d.getMinutes() });
}

function whenText(at: number, now: Date): string {
  const d = new Date(at);
  const time = formatAlarmTime({ hour: d.getHours(), minute: d.getMinutes() });
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'long' })} · ${time}`;
}

/**
 * Today: “What am I doing today?” This morning's status, today's alarms in
 * time order, what's next, daily practice and a short progress snapshot.
 * Worked out from the saved alarms and today's mornings on this phone.
 */
export default function TodayScreen() {
  const { plan, snapshot, tonight } = useToday();
  const { value: access } = useAccessibilitySettings();
  const faith = useFaithSettings();
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const tradition = primaryTradition(faith);

  return (
    <Screen>
      <View style={styles.hero}>
        <ThemedText type="caption" themeColor="textSecondary">
          {date}
        </ThemedText>
        <ThemedText type="title">{getGreeting(now)}</ThemedText>
      </View>

      {/* During wind-down and the night, Tonight comes first. */}
      {tonight?.kind === 'night' && tonight.prominent && <TonightSection view={tonight} />}

      {plan && <MorningCard morning={plan.morning} streak={snapshot?.streak ?? null} now={now} />}

      <Section>
        <ListRow
          icon={{ ios: 'alarm', android: 'alarm', web: 'alarm' }}
          title="Next alarm"
          value={plan ? (plan.next ? whenText(plan.next.at, now) : 'None set') : '…'}
          href={plan?.next ? { pathname: '/today/alarm/[id]', params: { id: plan.next.alarmId } } : '/alarms'}
        />
      </Section>

      <Section
        title="Today’s schedule"
        footer={plan && plan.schedule.length > 0 ? 'Tap an alarm to see or change it. Manage every alarm in Alarms.' : undefined}>
        {plan?.schedule.length === 0 && (
          <ListRow
            icon={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
            title="Nothing scheduled today"
            subtitle="Create an alarm in Alarms"
            href="/alarms"
          />
        )}
        {plan?.schedule.map((item) => <ScheduleRow key={item.key} item={item} profile={access.mobilityProfile} />)}
      </Section>

      <Section>
        <ListRow
          icon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          title="View weekly schedule"
          subtitle="Every active alarm for the next 7 days"
          href="/today/week"
        />
      </Section>

      {tonight && !(tonight.kind === 'night' && tonight.prominent) && <TonightSection view={tonight} />}

      <Section title="Daily practice">
        {tradition && (
          <ListRow
            icon={{ ios: 'book', android: 'menu_book', web: 'menu_book' }}
            title="Today’s Recitation"
            subtitle={TRADITION_LABEL[tradition]}
            href={{ pathname: '/alarms/faith/day', params: { tradition } }}
          />
        )}
        {faith.primary !== null && (
          <ListRow
            icon={{ ios: 'leaf', android: 'spa', web: 'spa' }}
            title="Reflection / Meditation"
            subtitle="A guided session with music"
            href={{ pathname: '/alarms/practice', params: { mission: 'reflection' } }}
          />
        )}
        <ListRow
          icon={{ ios: 'play.circle', android: 'play_circle', web: 'play_circle' }}
          title="Practise a mission"
          subtitle="No alarm, no XP"
          href="/alarms/missions"
        />
      </Section>

      <Section title="Progress">
        <ListRow
          icon={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
          title="Morning streak"
          value={snapshot ? plural(snapshot.streak, 'day') : '…'}
          href="/progress"
        />
        <ListRow
          icon={{ ios: 'star', android: 'star', web: 'star' }}
          title="XP today"
          value={snapshot ? `${snapshot.xpToday} XP · ${snapshot.rank}` : '…'}
          href="/progress"
        />
      </Section>
    </Screen>
  );
}

/** Only the Main Wake-Up Alarm decides the morning and the streak. */
function MorningCard({ morning, streak, now }: { morning: MorningStatus; streak: number | null; now: Date }) {
  const theme = useTheme();
  let title: string;
  let detail: string;
  let action: { title: string; onPress: () => void } | null = null;
  switch (morning.kind) {
    case 'ahead':
      title = 'Morning ahead';
      detail = `Main Wake-Up · ${formatAlarmTime(morning)}`;
      break;
    case 'in_progress':
      title = 'Morning mission waiting';
      detail = 'Your Main Wake-Up rang. Finish its mission to complete the morning.';
      action = {
        title: 'Finish mission',
        onPress: () => router.push({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: morning.occurrenceId } }),
      };
      break;
    case 'complete':
      title = 'Morning complete';
      detail = streak === null ? 'Well done.' : `Current streak · ${plural(streak, 'day')}`;
      break;
    case 'not_complete':
      title = 'Morning not completed';
      detail = `${morning.summary}. Tomorrow is a new morning.`;
      break;
    case 'not_today':
      title = 'No Main Wake-Up today';
      detail = morning.nextAt ? `Next: ${whenText(morning.nextAt, now)}` : 'Your Main Wake-Up Alarm is turned off.';
      break;
    case 'no_main':
      title = 'No Main Wake-Up Alarm';
      detail = 'Create a morning alarm and Terbit MY will offer to make it your Main Wake-Up, which tracks your mornings and streak.';
      break;
  }
  return (
    <ThemedView type="backgroundElement" style={styles.card} accessibilityRole="summary">
      <ThemedText type="headline" style={{ color: morning.kind === 'complete' ? theme.tint : theme.text }}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{detail}</ThemedText>
      {action && <Button title={action.title} onPress={action.onPress} />}
    </ThemedView>
  );
}

function ScheduleRow({ item, profile }: { item: TodayItem; profile: MobilityProfile }) {
  // Decided by `todayAlarmAction`: a mission still waiting (and still in its window) resumes; otherwise the alarm opens.
  const action = item.action;
  const href =
    action.kind === 'resume_mission'
      ? ({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: action.occurrenceId } } as const)
      : action.kind === 'edit_alarm'
        ? ({ pathname: '/today/alarm/[id]', params: { id: action.alarmId } } as const)
        : undefined;
  return (
    <ListRow
      icon={
        item.status === 'completed'
          ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
          : item.isMainWakeUp
            ? { ios: 'sunrise.fill', android: 'wb_twilight', web: 'wb_twilight' }
            : { ios: 'alarm', android: 'alarm', web: 'alarm' }
      }
      title={`${formatAlarmTime(item)} · ${item.snoozedUntil ? `Snoozed · next ring ${clockOf(item.snoozedUntil)}` : TODAY_STATUS_LABEL[item.status]}`}
      subtitle={describeScheduleItem(item, profile)}
      href={href}
    />
  );
}

/**
 * Tonight (Night Routine): a short plan, not settings. Tapping opens the
 * Night Routine; during wind-down the calming activity is offered.
 */
function TonightSection({ view }: { view: TonightView }) {
  if (view.kind === 'no_routine') {
    return (
      <Section title="Tonight">
        <ListRow
          icon={{ ios: 'moon.stars', android: 'bedtime', web: 'bedtime' }}
          title="Set up a Night Routine"
          subtitle="Restrict distracting apps from wind-down, wake with your Main Wake-Up"
          href="/alarms/night"
        />
      </Section>
    );
  }
  if (view.kind === 'not_tonight') {
    return (
      <Section title="Tonight">
        <ListRow
          icon={{ ios: 'moon', android: 'bedtime', web: 'bedtime' }}
          title="No Night Routine tonight"
          subtitle={view.nextWindDownAt ? `Next wind-down: ${new Date(view.nextWindDownAt).toLocaleDateString(undefined, { weekday: 'long' })}` : undefined}
          href="/alarms/night"
        />
      </Section>
    );
  }
  const status = describeRestriction(view.restriction);
  return (
    <Section title={tonightTitle(view.restriction, view.phase)} footer={status ?? undefined}>
      {view.items.map((item) => {
        const row = tonightRow(item);
        return (
          <ListRow
            key={item.kind}
            icon={
              item.kind === 'main_wake_up' || item.kind === 'no_main_wake_up'
                ? { ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' }
                : item.kind === 'restrictions_end' || (item.kind === 'wind_down' && item.restrictsApps)
                  ? { ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }
                  : { ios: 'moon', android: 'bedtime', web: 'bedtime' }
            }
            title={row.time}
            subtitle={row.title}
            href={item.kind === 'main_wake_up' ? { pathname: '/today/alarm/[id]', params: { id: item.alarmId } } : '/alarms/night'}
          />
        );
      })}
      {view.activity && (
        <ListRow
          icon={{ ios: 'leaf', android: 'spa', web: 'spa' }}
          title={`Wind down: ${NIGHT_ACTIVITY_LABEL[view.activity]}`}
          subtitle="Optional · no XP"
          href={{ pathname: '/alarms/practice', params: NIGHT_ACTIVITY_ROUTE[view.activity] }}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.one,
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
