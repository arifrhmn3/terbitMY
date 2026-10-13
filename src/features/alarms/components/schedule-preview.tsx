import { useState } from 'react';

import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';

import { formatAlarmTime, type AlarmDraft } from '../alarm';
import { snoozeSchedule } from '../snooze';

/**
 * "Preview schedule": every time this ONE alarm could ring (the alarm, then
 * each snooze). A preview only: nothing is scheduled, and it follows the
 * time and snooze settings as they change.
 */
export function SchedulePreview({ draft }: { draft: AlarmDraft }) {
  const [open, setOpen] = useState(false);
  const rings = snoozeSchedule(draft, draft.snooze, draft.isPrimary ? 'Main Wake-Up' : 'Alarm');
  const last = rings[rings.length - 1];

  return (
    <Section
      title={draft.isPrimary ? 'Your morning alarm schedule' : 'Alarm schedule'}
      footer={open ? 'A preview only. Nothing extra is scheduled.' : undefined}>
      <ListRow
        icon={{ ios: open ? 'chevron.up' : 'calendar.badge.clock', android: 'schedule', web: 'schedule' }}
        title="Preview schedule"
        subtitle={
          rings.length > 1
            ? `${formatAlarmTime(rings[0])} to ${formatAlarmTime(last)} · ${rings.length} rings at most`
            : `${formatAlarmTime(rings[0])} · rings once (no snooze)`
        }
        onPress={() => setOpen((v) => !v)}
      />
      {open &&
        rings.map((ring) => (
          <ListRow
            key={ring.index}
            icon={
              ring.index === 0
                ? { ios: 'alarm.fill', android: 'alarm', web: 'alarm' }
                : { ios: 'zzz', android: 'snooze', web: 'snooze' }
            }
            title={`${formatAlarmTime(ring)} · ${ring.label}`}
          />
        ))}
    </Section>
  );
}
