import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAlarmDraft, type Alarm, type AlarmDraft } from './alarm';
import { groupAlarmsForManage } from './manage';

const root = join(__dirname, '..', '..', '..');
const alarm = (id: string, o: Partial<AlarmDraft>): Alarm => ({ ...createAlarmDraft(o), id, createdAt: 0, updatedAt: 0 });

describe('Manage alarms: grouped by mission, then by time', () => {
  const alarms = [
    alarm('squats-18', { hour: 18, minute: 0, mission: { type: 'fitness', exercise: 'squats', difficulty: 'easy' } }),
    alarm('quiz-12', { hour: 12, minute: 30, mission: { type: 'quiz', category: 'vocabulary', difficulty: 'easy', questionCount: 3 } }),
    alarm('none-5', { hour: 5, minute: 0, mission: { type: 'none' } }),
    alarm('faith-5', { hour: 5, minute: 15, mission: { type: 'recitation', tradition: 'islam' } }),
    alarm('math-7', { hour: 7, minute: 0, enabled: false }),
    alarm('math-6', { hour: 6, minute: 30 }),
    alarm('reflect-21', { hour: 21, minute: 0, mission: { type: 'reflection', difficulty: 'easy' } }),
  ];

  it('Education, Fitness, Faith, No mission; earliest first within each; on and off alarms both shown', () => {
    const groups = groupAlarmsForManage(alarms, 'standard');
    expect(groups.map((g) => [g.title, g.alarms.map((a) => a.id)])).toEqual([
      ['Education', ['math-6', 'math-7', 'quiz-12']],
      ['Fitness', ['squats-18']],
      ['Faith', ['faith-5', 'reflect-21']],
      ['No mission', ['none-5']],
    ]);
  });

  it('every alarm appears exactly once; empty groups are left out', () => {
    const ids = groupAlarmsForManage(alarms, 'standard').flatMap((g) => g.alarms.map((a) => a.id));
    expect(ids.sort()).toEqual(alarms.map((a) => a.id).sort());
    expect(groupAlarmsForManage([alarms[0]], 'standard').map((g) => g.id)).toEqual(['fitness']);
  });

  it('the Non-physical Mobility Profile calls it “Wake-up activity”', () => {
    expect(groupAlarmsForManage(alarms, 'non_physical').map((g) => g.title)).toContain('Wake-up activity');
  });
});

describe('navigation: after an alarm mission, back to the real Today tab', () => {
  const navigation = readFileSync(join(root, 'src/features/today/navigation.ts'), 'utf8');
  const returnBody = navigation.slice(navigation.indexOf('export function returnToToday'));

  it('uses ONE dismissTo action (pops the alarm screen to the existing tabs), never dismissAll + navigate', () => {
    expect(returnBody).toContain("router.dismissTo('/today')");
    expect(returnBody).not.toMatch(/router\.navigate|router\.push|dismissAll/);
  });

  it('the alarm screen’s finish (done or given up) uses it, so Today is never shown as a sheet over the old mission', () => {
    const ringing = readFileSync(join(root, 'src/features/alarms/components/alarm-ringing.tsx'), 'utf8');
    expect(ringing).toContain("if (occurrence && occurrence.source !== 'simulated') returnToToday();");
    expect(ringing).not.toMatch(/showToday\(/);
  });
});
