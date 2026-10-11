import type { ReactNode } from 'react';

import type { FeatureKey } from './features';
import { useEntitlement } from './entitlements';

type FeatureGateProps = {
  feature: FeatureKey;
  children: ReactNode;
  /** Shown when the feature isn't available (e.g. a future upgrade prompt). Nothing by default. */
  fallback?: ReactNode;
};

/** Renders `children` only when the entitlement system allows `feature`. */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { has } = useEntitlement();
  return <>{has(feature) ? children : fallback}</>;
}
