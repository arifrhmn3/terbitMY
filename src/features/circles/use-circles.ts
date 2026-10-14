import { useSyncExternalStore } from 'react';

import { circles } from './circles';
import type { CirclesState } from './circles-store';

export function useCircles(): CirclesState {
  return useSyncExternalStore(circles.subscribe, circles.getState, circles.getState);
}
