import { useLocalSearchParams } from 'expo-router';

import { AlarmRinging } from '@/features/alarms/components/alarm-ringing';

/** Full-screen alarm for one occurrence (simulated now; native alarms later). */
export default function AlarmScreen() {
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
  return <AlarmRinging key={occurrenceId} occurrenceId={occurrenceId} />;
}
