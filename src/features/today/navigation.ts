import { router } from 'expo-router';

/**
 * From a flow inside a tab (alarm creation): close what's open in the
 * current tab's stack, then switch to the Today tab.
 */
export function showToday() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/today');
}

/**
 * From the full-screen alarm screen (after a mission, or giving up): ONE
 * navigation action back to the normal Today tab. `dismissTo` pops the alarm
 * screen and selects Today in the existing tabs; when the alarm screen is the
 * only screen (Terbit MY was opened straight into it), it replaces it with
 * Today. Never `dismissAll()` + `navigate()`: since React Navigation 7,
 * `navigate` can push a second copy of the tabs ON TOP of the alarm screen,
 * which showed Today as a sheet with the old mission underneath.
 */
export function returnToToday() {
  router.dismissTo('/today');
}
