import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { handOff, occurrences, useAlarms } from '@/features/alarms/alarms';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { useNightRoutine } from '@/features/night/night';
import { progress } from '@/features/progress/progress';
import type { ProgressSummary } from '@/features/progress/progression';

import { buildToday, xpToday, type TodayPlan } from './today';
import { buildTonight, type TonightView } from './tonight';

export type TodaySnapshot = { streak: number; xpToday: number; rank: string };

function startOfToday(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Today's plan and progress snapshot. Read again whenever Today is shown,
 * after an alarm hand-off, when XP changes, and once a minute (so "upcoming"
 * turns into "earlier today" without reopening the screen).
 */
export function useToday(): { plan: TodayPlan | null; snapshot: TodaySnapshot | null; tonight: TonightView | null } {
  const { status, alarms } = useAlarms();
  const night = useNightRoutine();
  const [mornings, setMornings] = useState<AlarmOccurrence[] | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [xp, setXp] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    const t = Date.now();
    setNow(t);
    occurrences
      .listSince(startOfToday(t))
      .then(setMornings)
      .catch(() => setMornings([]));
    progress
      .summary()
      .then(setSummary)
      .catch(() => {});
    progress
      .ledger()
      .then(({ xp: ledger }) => setXp(xpToday(ledger, t)))
      .catch(() => {});
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    const offHandOff = handOff.subscribe(() => refresh());
    const offProgress = progress.subscribe(() => refresh());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      offHandOff();
      offProgress();
      clearInterval(timer);
    };
  }, [refresh]);

  const pendingSnoozes = [...handOff.pendingSnoozes().values()];
  const plan = status === 'ready' && mornings ? buildToday({ alarms, occurrences: mornings, pendingSnoozes, now }) : null;
  const snapshot = summary ? { streak: summary.morning.streak.current, xpToday: xp, rank: summary.ranks.overall.label } : null;
  // Tonight (Night Routine): wind-down → restrictions → bedtime → tomorrow's Main Wake-Up.
  const tonight =
    status === 'ready' && night.status === 'ready'
      ? buildTonight({
          routine: night.routine,
          alarms,
          occurrences: mornings ?? [],
          now,
          restrictionsAvailable: night.authorization === 'approved',
          override: night.native.overriddenUntil ? { until: night.native.overriddenUntil } : null,
        })
      : null;
  return { plan, snapshot, tonight };
}
