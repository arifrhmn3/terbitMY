import { describeRepeat, formatAlarmTime, type Weekday } from '@/features/alarms/alarm';
import type { ScreenTimeAuthorization } from '@/services/screen-time';

import { selectionCount, type AppSelection, type ClockTime, type NightActivity } from './night-routine';
import type { NightPhase, RestrictionState, TonightItem } from './night-timeline';

/** The words every Night Routine screen uses (one place). */

export const NIGHT_ACTIVITY_LABEL: Record<NightActivity, string> = {
  none: 'None',
  reflection: 'Reflection / Meditation',
  breathing: 'Guided breathing',
};

/** Where each calming activity opens (Practice: no alarm, no XP). Existing missions, no new types. */
export const NIGHT_ACTIVITY_ROUTE: Record<Exclude<NightActivity, 'none'>, { mission: string; exercise?: string }> = {
  reflection: { mission: 'reflection' },
  breathing: { mission: 'fitness', exercise: 'controlled_breathing' },
};

export function describeNights(weekdays: readonly Weekday[]): string {
  return describeRepeat(weekdays) === 'Once' ? 'No nights chosen' : `${describeRepeat(weekdays)}`;
}

export function describeSelection(selection: AppSelection): string {
  if (selection.token === null || selectionCount(selection) === 0) return 'None chosen';
  const parts = [
    selection.applications > 0 ? `${selection.applications} app${selection.applications === 1 ? '' : 's'}` : null,
    selection.categories > 0 ? `${selection.categories} categor${selection.categories === 1 ? 'y' : 'ies'}` : null,
    selection.webDomains > 0 ? `${selection.webDomains} website${selection.webDomains === 1 ? '' : 's'}` : null,
  ];
  return parts.filter(Boolean).join(', ');
}

const clock = (at: number) => {
  const d = new Date(at);
  return formatAlarmTime({ hour: d.getHours(), minute: d.getMinutes() });
};

/** One "Tonight" row: time and what happens. */
export function tonightRow(item: TonightItem): { time: string; title: string } {
  switch (item.kind) {
    case 'wind_down':
      return { time: clock(item.at), title: item.restrictsApps ? 'Wind-down begins · Apps restricted' : 'Wind-down begins' };
    case 'bedtime':
      return { time: clock(item.at), title: 'Bedtime' };
    case 'restrictions_end':
      return { time: clock(item.at), title: 'Restrictions end' };
    case 'main_wake_up':
      return { time: clock(item.at), title: item.endsRestrictions ? 'Main Wake-Up tomorrow · Restrictions end' : 'Main Wake-Up tomorrow' };
    case 'no_main_wake_up':
      return { time: '—', title: 'No Main Wake-Up tomorrow: no morning wake alarm is scheduled' };
  }
}

/** The restriction state in a few words. */
export function describeRestriction(state: RestrictionState): string | null {
  switch (state.kind) {
    case 'inactive':
      return null;
    case 'unavailable':
      return 'App restrictions aren’t available yet (see Settings → Screen Time)';
    case 'scheduled':
      return `Apps restricted from wind-down (${clock(state.startsAt)}) until ${clock(state.endsAt)}`;
    case 'active':
      return `Apps restricted until ${clock(state.endsAt)}`;
    case 'overridden':
      return `Restrictions ended for tonight · back from the next night`;
    case 'ended':
      return `Night restrictions ended at ${clock(state.endedAt)}`;
  }
}

/**
 * Today's "Tonight" heading. Restrictions begin at wind-down, so from then on
 * it says "Wind-down active"; after bedtime "Bedtime" (the same restricted
 * period continues: nothing new starts at bedtime). The footer always says
 * "Apps restricted until …".
 */
export function tonightTitle(restriction: RestrictionState, phase: NightPhase): string {
  if (restriction.kind !== 'active') return 'Tonight';
  return phase === 'night' ? 'Tonight · Bedtime' : 'Tonight · Wind-down active';
}

/** "7h 30m" (the Available Sleep Window, never called sleep). */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The weekly schedule's Night Routine line (after "22:30 · Night Routine"). */
export function weeklyNightSummary(night: { bedtimeAt: number; restrictions: { from: number; until: number } | null }): string {
  return night.restrictions
    ? `Apps restricted from wind-down · Bedtime ${clock(night.bedtimeAt)} · Ends ${clock(night.restrictions.until)}`
    : `Bedtime ${clock(night.bedtimeAt)}`;
}

/**
 * NOTIFICATIONS: what Terbit MY can honestly say. Apple's Screen Time APIs
 * (FamilyControls, ManagedSettings, DeviceActivity) have no setting for other
 * apps' notifications, so Terbit MY never promises to block or silence them,
 * and it can't turn on a Focus itself. Sleep Focus, which the user sets up
 * once in iPhone Settings, is the supported way. See docs/ARCHITECTURE.md.
 */
export const NOTIFICATION_INFO = {
  title: 'Notifications',
  value: 'Not changed by Terbit MY',
  guidance: 'Terbit MY restricts opening the apps you choose. It can’t turn off other apps’ notifications or turn on a Focus for you.',
} as const;

/** The optional Sleep Focus suggestion (supportive, never required). */
export function sleepFocusGuidance(windDown: ClockTime): string {
  return `Optional: for a fully quiet wind-down, set up Sleep Focus to start at the same time as your Terbit wind-down (${formatAlarmTime(windDown)}). iPhone Settings → Focus → Sleep.`;
}

/** Screen Time access, in plain words, with what to do next. */
export const AUTHORIZATION_INFO: Record<ScreenTimeAuthorization | 'checking', { label: string; guidance: string }> = {
  checking: { label: 'Checking…', guidance: '' },
  not_configured: {
    label: 'Not in this build',
    guidance:
      'This version of Terbit MY was built without Screen Time, so it can’t restrict apps. Install the Screen Time build to use app restrictions. Your Night Routine, wind-down and bedtime still work.',
  },
  unavailable: {
    label: 'Not available',
    guidance:
      'Screen Time can’t be used here (for example in Expo Go, on Android, or if iOS reported an error). Your Night Routine, wind-down and bedtime still work.',
  },
  not_determined: {
    label: 'Not set up',
    guidance: 'Allow Screen Time access to choose apps to restrict at night. iOS asks you to confirm with Face ID, Touch ID or your passcode.',
  },
  approved: {
    label: 'Allowed',
    guidance: 'You can choose apps to restrict at night. To stop, turn restrictions off in your Night Routine, or remove access in iPhone Settings → Screen Time.',
  },
  denied: {
    label: 'Not allowed',
    guidance: 'Screen Time access was turned off. To allow it again: iPhone Settings → Screen Time → Apps with Screen Time Access → Terbit MY.',
  },
};
