import { useWindowDimensions } from 'react-native';

import { LargeTextScale } from '@/constants/text-scale';

/** True when the user's text size is large enough that side-by-side layouts should stack. */
export function isLargeText(fontScale: number): boolean {
  return fontScale >= LargeTextScale;
}

export function useLargeText(): boolean {
  return isLargeText(useWindowDimensions().fontScale);
}
