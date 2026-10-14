import { describeMission, describeRepeat, formatAlarmTime, type Alarm, type AlarmDraft } from '@/features/alarms/alarm';
import { describeDays, isActiveAlarm, mainWakeUpOverlaps, resolveMainWakeUpOverlaps } from '@/features/alarms/main-wake-up';
import type { FaithPreference } from '@/features/faith/types';
import type { MobilityProfile } from '@/features/missions/fitness/types';
import { createNightRoutineDraft, type NightRoutine, type NightRoutineDraft } from '@/features/night/night-routine';

import type { PlanSlot, RoutinePlan } from './plan';
import type { PersonalisationAnswers } from './types';

/**
 * ACCEPTING A ROUTINE. The plan is saved through the app's normal stores,
 * so the alarms are real (native scheduling, Main Wake-Up rules, snooze,
 * entitlements all apply as usual).
 *
 * IDEMPOTENT: each alarm Terbit generated is remembered by its plan slot
 * (`generated`: slot → alarm id, stored on the phone). Running
 * personalisation again UPDATES those same alarms, deletes generated ones
 * the new plan no longer has, and never duplicates a Main Wake-Up, a Night
 * Routine (there is one, `NIGHT_ROUTINE_ID`) or a goal alarm.
 *
 * The user's own alarms are never edited, except that a new Main Wake-Up
 * takes over overlapping days through the existing replacement rule
 * (`resolveMainWakeUpOverlaps`: partial overlap subtracts days, full
 * overlap deletes). That is listed in `routineChanges` and confirmed before
 * anything is saved. History (mornings, XP, streaks, achievements) is never
 * touched: deleting an alarm keeps its records.
 */
export type GeneratedAlarms = Partial<Record<PlanSlot, string>>;

export type ChangeLine = { kind: 'add' | 'update' | 'remove' | 'main_trimmed' | 'main_replaced' | 'night_create' | 'night_update' | 'faith' | 'mobility'; text: string };

export type RoutineChanges = {
  lines: ChangeLine[];
  /** The user already had something set up (alarms or a Night Routine): accepting needs an explicit confirmation. */
  replacesExisting: boolean;
  /** The user's own alarms left exactly as they are. */
  untouched: number;
};

const describeAlarm = (a: Pick<Alarm, 'hour' | 'minute' | 'weekdays' | 'label' | 'mission'>) =>
  `${a.label || describeMission(a.mission)} (${formatAlarmTime(a)}, ${describeRepeat(a.weekdays)})`;

function generatedIds(generated: GeneratedAlarms, alarms: readonly Alarm[]): Set<string> {
  const ids = new Set(Object.values(generated).filter((id): id is string => !!id));
  return new Set(alarms.filter((a) => ids.has(a.id)).map((a) => a.id));
}

/** What accepting would do, in plain words, before anything is saved. Pure. */
export function routineChanges(params: {
  plan: RoutinePlan;
  alarms: readonly Alarm[];
  generated: GeneratedAlarms;
  night: NightRoutine | null;
  current: { faith: FaithPreference | null; mobilityProfile: MobilityProfile };
  answers: Pick<PersonalisationAnswers, 'faith' | 'mobilityProfile'>;
  now: number;
}): RoutineChanges {
  const { plan, alarms, generated, night, current, answers, now } = params;
  const lines: ChangeLine[] = [];
  const ours = generatedIds(generated, alarms);
  const planned = new Set(plan.alarms.map((p) => generated[p.slot]).filter((id): id is string => !!id && ours.has(id)));

  for (const p of plan.alarms) {
    const id = generated[p.slot];
    const existing = id ? alarms.find((a) => a.id === id) : undefined;
    lines.push(existing ? { kind: 'update', text: `Updated: ${describeAlarm(p.draft)}` } : { kind: 'add', text: `New: ${describeAlarm(p.draft)}` });
  }
  for (const a of alarms) {
    if (ours.has(a.id) && !planned.has(a.id)) lines.push({ kind: 'remove', text: `Removed (from your earlier routine): ${describeAlarm(a)}` });
  }

  // The user's own Main Wake-Ups that the new ones take days from (the normal replacement rule).
  let simulated = alarms.filter((a) => !ours.has(a.id) || planned.has(a.id));
  const affected = new Set<string>();
  for (const p of plan.alarms.filter((x) => x.draft.isPrimary)) {
    const selfId = generated[p.slot];
    const overlaps = mainWakeUpOverlaps(p.draft, simulated, selfId, now).filter((o) => !ours.has(o.alarm.id));
    const { update, remove } = resolveMainWakeUpOverlaps(overlaps);
    for (const u of update) {
      affected.add(u.id);
      lines.push({ kind: 'main_trimmed', text: `Your Main Wake-Up ${describeAlarm(alarms.find((a) => a.id === u.id) ?? u)} keeps only ${describeDays(u.weekdays)}` });
    }
    for (const r of remove) {
      affected.add(r.id);
      lines.push({ kind: 'main_replaced', text: `Replaced and deleted: your Main Wake-Up ${describeAlarm(r)}` });
    }
    simulated = simulated.filter((a) => !remove.some((r) => r.id === a.id)).map((a) => update.find((u) => u.id === a.id) ?? a);
  }

  if (plan.night) {
    const t = (x: { hour: number; minute: number }) => formatAlarmTime(x);
    if (!night) lines.push({ kind: 'night_create', text: `New Night Routine: wind-down ${t(plan.night.windDown)}, bedtime ${t(plan.night.bedtime)}` });
    else if (t(night.windDown) !== t(plan.night.windDown) || t(night.bedtime) !== t(plan.night.bedtime) || !night.enabled) {
      lines.push({
        kind: 'night_update',
        text: `Night Routine: wind-down ${t(night.windDown)} → ${t(plan.night.windDown)}, bedtime ${t(night.bedtime)} → ${t(plan.night.bedtime)}. Your apps, nights and other settings stay.`,
      });
    }
  }
  if (answers.faith !== current.faith) lines.push({ kind: 'faith', text: 'Your Faith setting is updated (private).' });
  if (answers.mobilityProfile !== current.mobilityProfile) lines.push({ kind: 'mobility', text: 'Your Mobility Profile is updated.' });

  const own = alarms.filter((a) => !ours.has(a.id) && isActiveAlarm(a, now));
  return {
    lines,
    replacesExisting: own.length > 0 || ours.size > 0 || night !== null,
    untouched: own.filter((a) => !affected.has(a.id)).length,
  };
}

/** The stores accepting writes to (the app's real ones; in tests, in-memory ones). */
export type ApplyTargets = {
  alarms: {
    getState(): { status: string; alarms: Alarm[] };
    load(): Promise<void>;
    save(draft: AlarmDraft, id?: string): Promise<{ alarm: Alarm; result: { status: string; message?: string } | null }>;
    remove(id: string): Promise<void>;
  };
  night: { getState(): { status: string; routine: NightRoutine | null }; load(): Promise<void>; save(draft: NightRoutineDraft): Promise<NightRoutine> };
  setFaith(primary: FaithPreference | null): Promise<unknown>;
  setMobilityProfile(profile: MobilityProfile): Promise<unknown>;
};

export type ApplyResult = {
  generated: GeneratedAlarms;
  /** Alarms saved in Terbit that the phone couldn't schedule (e.g. alarm permission not allowed). */
  notScheduled: number;
};

/** Loads the alarm and night stores if they haven't been yet (never reloads what screens already show). */
export async function ensureLoaded(targets: Pick<ApplyTargets, 'alarms' | 'night'>) {
  if (targets.alarms.getState().status !== 'ready') await targets.alarms.load();
  if (targets.night.getState().status !== 'ready') await targets.night.load();
}

/** The Night Routine to save: an existing one keeps everything except its times (and is turned on). */
export function nightDraftFor(existing: NightRoutine | null, sleep: NonNullable<RoutinePlan['night']>): NightRoutineDraft {
  if (!existing) return createNightRoutineDraft({ windDown: { ...sleep.windDown }, bedtime: { ...sleep.bedtime } });
  const { id: _id, createdAt: _c, updatedAt: _u, ...draft } = existing;
  return { ...draft, enabled: true, windDown: { ...sleep.windDown }, bedtime: { ...sleep.bedtime } };
}

/**
 * Saves the accepted routine. Order matters: generated alarms the plan no
 * longer has are removed first, then the plan's alarms are saved weekday
 * Main Wake-Up first, so the Main Wake-Up rule never trims Terbit's own new
 * alarms. Safe to run again with the result's `generated`.
 */
export async function applyPlan(plan: RoutinePlan, answers: PersonalisationAnswers, generated: GeneratedAlarms, targets: ApplyTargets): Promise<ApplyResult> {
  await ensureLoaded(targets);
  await targets.setFaith(answers.faith);
  await targets.setMobilityProfile(answers.mobilityProfile);

  const current = () => targets.alarms.getState().alarms;
  const keep = new Set(plan.alarms.map((p) => generated[p.slot]).filter((id): id is string => !!id));
  for (const id of Object.values(generated)) {
    if (id && !keep.has(id) && current().some((a) => a.id === id)) await targets.alarms.remove(id);
  }

  const next: GeneratedAlarms = {};
  let notScheduled = 0;
  for (const p of plan.alarms) {
    const id = generated[p.slot];
    const exists = !!id && current().some((a) => a.id === id);
    const { alarm, result } = await targets.alarms.save(p.draft, exists ? id : undefined);
    if (result && (result.status === 'permission-denied' || result.status === 'failed')) notScheduled++;
    next[p.slot] = alarm.id;
  }

  if (plan.night) await targets.night.save(nightDraftFor(targets.night.getState().routine, plan.night));
  return { generated: next, notScheduled };
}
