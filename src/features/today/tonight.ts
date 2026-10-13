import type { Alarm } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import type { NightActivity, NightRoutine } from '@/features/night/night-routine';
import {
  currentNight,
  nextNight,
  nightPhase,
  restrictionState,
  tonightItems,
  type NightPhase,
  type NightWindow,
  type RestrictionOverride,
  type RestrictionState,
  type TonightItem,
} from '@/features/night/night-timeline';

/**
 * "Tonight" on Today: a short plan, not a settings page. Pure.
 * - no_routine: a single row offering to set one up;
 * - not_tonight: the routine doesn't run tonight (with the next evening it does);
 * - night: tonight's (or last night's, until the morning) wind-down → bedtime → Main Wake-Up.
 */
export type TonightView =
  | { kind: 'no_routine' }
  | { kind: 'not_tonight'; nextWindDownAt: number | null }
  | {
      kind: 'night';
      night: NightWindow;
      items: TonightItem[];
      phase: NightPhase;
      restriction: RestrictionState;
      /** The calming activity to offer now (during wind-down only). */
      activity: Exclude<NightActivity, 'none'> | null;
      /** Show it near the top of Today (winding down, night, or restrictions active). */
      prominent: boolean;
    };

export function buildTonight(params: {
  routine: NightRoutine | null;
  alarms: readonly Alarm[];
  occurrences?: readonly AlarmOccurrence[];
  now: number;
  /** Screen Time is authorised in a build that includes it. */
  restrictionsAvailable: boolean;
  override?: RestrictionOverride;
}): TonightView {
  const { routine, alarms, occurrences = [], now, restrictionsAvailable, override = null } = params;
  if (!routine) return { kind: 'no_routine' };
  const night = currentNight(routine, alarms, now, occurrences);
  if (!night) return { kind: 'not_tonight', nextWindDownAt: nextNight(routine, alarms, now)?.windDownAt ?? null };
  const phase = nightPhase(night, now);
  const restriction = restrictionState({ routine, alarms, now, available: restrictionsAvailable, override, recorded: occurrences });
  return {
    kind: 'night',
    night,
    items: tonightItems(night),
    phase,
    restriction,
    activity: phase === 'wind_down' && routine.activity !== 'none' ? routine.activity : null,
    prominent: phase !== 'evening' || restriction.kind === 'active' || restriction.kind === 'overridden',
  };
}
