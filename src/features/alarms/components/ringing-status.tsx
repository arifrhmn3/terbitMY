import { useEffect, useState } from 'react';

import { Notice } from '@/components/notice';
import { getAlarmService, type AlarmCapabilities } from '@/services/alarm-scheduler';

/**
 * Tells the user plainly whether saved alarms can ring on this phone.
 * Shows nothing once a native alarm implementation reports it is ready.
 */
export function RingingStatus() {
  const [capabilities, setCapabilities] = useState<AlarmCapabilities | null>(null);

  useEffect(() => {
    let active = true;
    getAlarmService()
      .getCapabilities()
      .then((result) => active && setCapabilities(result));
    return () => {
      active = false;
    };
  }, []);

  if (!capabilities || capabilities.status === 'ready') return null;

  return (
    <Notice
      title={capabilities.status === 'not-implemented' ? 'Alarms can’t ring here' : 'Permission needed'}
      description={capabilities.summary}
    />
  );
}
