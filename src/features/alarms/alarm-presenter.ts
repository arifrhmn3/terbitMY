import { shouldPresent } from './alarm-handoff';
import type { AlarmOccurrence } from './occurrence';

/** The full-screen alarm/mission screen (not the Alarms tab, which is `/alarms`). */
export function isAlarmScreen(path: string): boolean {
  return path.startsWith('/alarm/') || path === '/alarm-fired';
}

/** Where the launch route goes: straight to the morning's alarm screen, or Today. */
export function launchRoute(occurrence: AlarmOccurrence | null) {
  return occurrence
    ? { pathname: '/alarm/[occurrenceId]' as const, params: { occurrenceId: occurrence.id } }
    : ('/today' as const);
}

/**
 * Decides when to open the alarm screen for a morning found by the hand-off.
 *
 * - It only navigates while the app is `active`. A hand-off run can finish
 *   while iOS is still bringing the app forward (the alarm button's App Intent
 *   runs then), and a full-screen page opened at that moment may never
 *   appear. The morning is kept and opened as soon as the app is active.
 * - Each morning opens at most once per session (see `shouldPresent`), so
 *   repeated signals for the same tap (native event, resume, retry) never
 *   navigate twice.
 * - The launch route (`/`) decides for itself; an alarm screen that's already
 *   open refreshes itself after every hand-off run.
 */
export function createAlarmPresenter(deps: {
  appState: () => string;
  path: () => string;
  navigate: (occurrenceId: string) => void;
  now?: () => number;
}) {
  const { appState, path, navigate, now = Date.now } = deps;
  /** When each occurrence was last shown this session. */
  const presentedAt = new Map<string, number>();
  let pending: AlarmOccurrence | null = null;

  function take(occurrence: AlarmOccurrence | null): AlarmOccurrence | null {
    const at = now();
    if (!occurrence || !shouldPresent(occurrence, at, presentedAt.get(occurrence.id))) return null;
    presentedAt.set(occurrence.id, at);
    return occurrence;
  }

  /** Opens the pending morning if the app and the current screen allow it. */
  function flush() {
    if (!pending || appState() !== 'active') return;
    const current = path();
    if (current === '/') return; // The launch route is still deciding.
    const occurrence = pending;
    pending = null;
    if (isAlarmScreen(current)) return; // It refreshes itself.
    const next = take(occurrence);
    if (next) navigate(next.id);
  }

  return {
    /** A hand-off run's result. Kept until it can be shown. */
    offer(occurrence: AlarmOccurrence | null) {
      if (occurrence) pending = occurrence;
      flush();
    },
    /** Call when the app becomes active or the screen changes. */
    flush,
    /** For the launch route: the morning to open directly, if any (marked as shown). */
    takeForLaunch: take,
    /** Something else opened this morning's screen (e.g. Android's "Start mission" link). */
    markPresented(occurrenceId: string) {
      presentedAt.set(occurrenceId, now());
    },
  };
}

export type AlarmPresenter = ReturnType<typeof createAlarmPresenter>;
