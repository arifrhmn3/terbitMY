import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getAlarmService } from '@/services/alarm-scheduler';

import { createAlarmPresenter } from './alarm-presenter';
import { handOff } from './alarms';

/** Fallback only: the native 'onAlarmAction' event normally reports the tap first. */
const RECHECK_AFTER_MS = 1200;

/** How long the launch screen waits for the hand-off before showing Today anyway. */
export const LAUNCH_WAIT_MS = 4000;

let currentPath = '/';

/** The app's one alarm presenter (one per session). */
export const alarmPresenter = createAlarmPresenter({
  appState: () => AppState.currentState,
  path: () => currentPath,
  navigate: (occurrenceId) => router.push({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId } }),
});

export function markAlarmPresented(occurrenceId: string) {
  alarmPresenter.markPresented(occurrenceId);
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
 * and an alarm button tap that iOS saves a moment before or after the app is
 * in front. Every hand-off run offers its result to the presenter, which
 * opens it once the app is active.
 */
export function useAlarmHandOff() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const pathname = usePathname();

  useEffect(() => {
    currentPath = pathname;
    alarmPresenter.flush();
  }, [pathname]);

  useEffect(() => {
    if (!navigationReady) return;

    const unsubscribeRuns = handOff.subscribe(alarmPresenter.offer);

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
      if (state !== 'active') return;
      // A run that finished while iOS was still bringing the app forward is opened now…
      alarmPresenter.flush();
      // …and a fresh run picks up anything saved since.
      checkSoon();
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
