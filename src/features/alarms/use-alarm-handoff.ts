import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getAlarmService } from '@/services/alarm-scheduler';

import { shouldPresent } from './alarm-handoff';
import { handOff } from './alarms';
import type { AlarmOccurrence } from './occurrence';

/** Fallback only: the native 'onAlarmAction' event normally reports the tap first. */
const RECHECK_AFTER_MS = 1200;

/** How long the launch screen waits for the hand-off before showing Today anyway. */
export const LAUNCH_WAIT_MS = 4000;

/** When each occurrence was last shown this session, so closing the alarm screen doesn't reopen it straight away. */
const presentedAt = new Map<string, number>();

export function markAlarmPresented(occurrenceId: string, at = Date.now()) {
  presentedAt.set(occurrenceId, at);
}

/** The morning to open now, if any (and remembers it as shown). */
export function takeAlarmToPresent(occurrence: AlarmOccurrence | null, now = Date.now()): AlarmOccurrence | null {
  if (!occurrence || !shouldPresent(occurrence, now, presentedAt.get(occurrence.id))) return null;
  markAlarmPresented(occurrence.id, now);
  return occurrence;
}

/**
 * When Terbit MY opens or returns to the foreground, records genuine native
 * alarms that went off and opens the alarm screen for a morning that still
 * needs its mission. The phone's own alarm controls are never blocked; this
 * only routes the user toward the mission afterwards.
 *
 * Cold start is handled by the launch route (`src/app/index.tsx`), which waits
 * for the first hand-off before showing anything, so Today never flashes
 * first. This hook covers everything after that: resume from the background,
 * and an alarm button tap that iOS saves a moment after the app is already
 * in front.
 */
export function useAlarmHandOff() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!navigationReady) return;
    // Every hand-off run (from here, the launch route or a screen) can open the mission.
    const unsubscribeRuns = handOff.subscribe((occurrence) => {
      // The launch route is still deciding, or an alarm screen is already open
      // (it refreshes itself after every hand-off run).
      const path = pathnameRef.current;
      if (path === '/' || path.startsWith('/alarm')) return;
      const next = takeAlarmToPresent(occurrence);
      if (next) router.push({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: next.id } });
    });

    function check() {
      handOff.sync().catch(() => null);
    }

    let retry: ReturnType<typeof setTimeout> | null = null;
    function checkSoon() {
      check();
      if (retry) clearTimeout(retry);
      retry = setTimeout(check, RECHECK_AFTER_MS);
    }

    // Subscribe before the first check, so a tap saved in between isn't missed.
    const unsubscribeAction = getAlarmService().onAlarmAction(check);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkSoon();
    });
    checkSoon();
    return () => {
      if (retry) clearTimeout(retry);
      unsubscribeRuns();
      unsubscribeAction();
      subscription.remove();
    };
  }, [navigationReady]);
}
