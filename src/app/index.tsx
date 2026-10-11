import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { handOff } from '@/features/alarms/alarms';
import { LAUNCH_WAIT_MS, takeAlarmToPresent } from '@/features/alarms/use-alarm-handoff';
import { useTheme } from '@/hooks/use-theme';

/**
 * Launch route. Before showing Today, checks whether Terbit MY was opened by an
 * alarm ("Stop & Open Terbit" / "Stop & Start Mission", or any alarm that went
 * off while it was closed) and, if so, opens that morning's mission screen
 * directly. If the check is slow, Today is shown and the mission opens once
 * the check finishes (see useAlarmHandOff).
 */
export default function Index() {
  const theme = useTheme();
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    let decided = false;
    const decide = (href: Href) => {
      if (decided) return;
      decided = true;
      setTarget(href);
    };
    const timer = setTimeout(() => decide('/today'), LAUNCH_WAIT_MS);
    handOff
      .sync()
      .catch(() => null)
      .then((occurrence) => {
        if (decided) return;
        const next = takeAlarmToPresent(occurrence);
        decide(next ? { pathname: '/alarm/[occurrenceId]', params: { occurrenceId: next.id } } : '/today');
      });
    return () => clearTimeout(timer);
  }, []);

  if (target) return <Redirect href={target} />;
  return <View style={{ flex: 1, backgroundColor: theme.background }} />;
}
