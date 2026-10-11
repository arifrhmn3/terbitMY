import { describe, expect, it, jest } from '@jest/globals';

import { createAlarmDraft } from './alarm';
import { createAlarmHandOff } from './alarm-handoff';
import { createAlarmPresenter, isAlarmScreen, launchRoute } from './alarm-presenter';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore } from './alarm-store';
import type { AlarmOccurrence } from './occurrence';
import { createOccurrenceManager } from './occurrence-manager';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmFiredEvent, AlarmService } from '@/services/alarm-scheduler';

const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m).getTime(); // Wednesday

/** The whole JS side of the hand-off, wired like the app: every run is offered to the presenter. */
async function setup(options: { appState: string; path: string }) {
  const clock = { time: at(6, 0) };
  const now = () => clock.time;
  const events: AlarmFiredEvent[] = [];
  const service: AlarmService = {
    ...createNotImplementedAlarmService(),
    schedule: jest.fn(async () => ({ status: 'scheduled' as const })),
    syncAll: jest.fn(async () => {}),
    getFireEvents: jest.fn(async () => [...events]),
  };
  const occurrenceRepository = createMemoryOccurrenceRepository();
  const occurrences = createOccurrenceManager(async () => occurrenceRepository, now);
  const alarmRepository = createMemoryAlarmRepository();
  const alarmStore = createAlarmStore(async () => alarmRepository, service, { now });
  const handOff = createAlarmHandOff({ alarmStore, occurrences, service, now });

  const app = { state: options.appState, path: options.path };
  const navigate = jest.fn((occurrenceId: string) => {
    app.path = `/alarm/${occurrenceId}`;
  });
  const presenter = createAlarmPresenter({ appState: () => app.state, path: () => app.path, navigate, now });
  handOff.subscribe(presenter.offer);

  const { alarm } = await alarmStore.save(createAlarmDraft({ completionMode: 'reward' }));
  clock.time = at(6, 31);

  const went = (): AlarmFiredEvent => ({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'schedule' });
  const tapped = (): AlarmFiredEvent => ({
    alarmId: alarm.id,
    scheduledAt: at(6, 30),
    firedAt: at(6, 30),
    evidence: 'system',
    stoppedAt: at(6, 31),
    stopAction: 'mission',
  });
  return { app, clock, events, service, handOff, presenter, navigate, occurrences, went, tapped };
}

describe('alarm button → mission screen', () => {
  it('cold launch: the launch route opens the mission directly', async () => {
    const ctx = await setup({ appState: 'active', path: '/' });
    ctx.events.push(ctx.tapped());

    const occurrence = await ctx.handOff.sync();
    expect(ctx.navigate).not.toHaveBeenCalled(); // The launch route decides on `/`.
    const route = launchRoute(ctx.presenter.takeForLaunch(occurrence));
    expect(route).toEqual({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: occurrence!.id } });
    expect(occurrence?.status).toBe('mission_in_progress');

    // Once there, later signals for the same tap don't open it again.
    ctx.app.path = `/alarm/${occurrence!.id}`;
    await ctx.handOff.sync();
    ctx.presenter.flush();
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it('background → active: a tap handled while iOS brings the app forward opens the mission once active', async () => {
    const ctx = await setup({ appState: 'background', path: '/alarms' });
    ctx.events.push(ctx.tapped());

    // The native event arrives before the app is active.
    const occurrence = await ctx.handOff.sync();
    expect(ctx.navigate).not.toHaveBeenCalled();

    ctx.app.state = 'active';
    ctx.presenter.flush();
    expect(ctx.navigate).toHaveBeenCalledTimes(1);
    expect(ctx.navigate).toHaveBeenCalledWith(occurrence!.id);
    expect((await ctx.occurrences.get(occurrence!.id))?.status).toBe('mission_in_progress');
  });

  it('opens from the Alarms tab (whose path also starts with "/alarm")', async () => {
    expect(isAlarmScreen('/alarms')).toBe(false);
    expect(isAlarmScreen('/alarms/history')).toBe(false);
    expect(isAlarmScreen('/alarm/abc')).toBe(true);

    const ctx = await setup({ appState: 'active', path: '/alarms' });
    ctx.events.push(ctx.tapped());
    await ctx.handOff.sync();
    expect(ctx.navigate).toHaveBeenCalledTimes(1);
  });

  it('tap saved just after the app became active: the open alarm screen moves into the mission', async () => {
    const ctx = await setup({ appState: 'active', path: '/today' });
    const seen: AlarmOccurrence[] = [];
    ctx.handOff.subscribe((o) => o && seen.push(o));

    // Resume: only the schedule is known yet, so the alarm screen opens.
    ctx.events.push(ctx.went());
    const ringing = await ctx.handOff.sync();
    expect(ringing?.status).toBe('alarm_fired');
    expect(ctx.navigate).toHaveBeenCalledTimes(1);

    // The App Intent saves the tap and the native event triggers another run.
    ctx.events.splice(0, 1, ctx.tapped());
    await ctx.handOff.sync();
    expect(ctx.navigate).toHaveBeenCalledTimes(1); // Not opened twice…
    // …the screen already open (subscribed to runs) sees its morning in the mission.
    expect(seen.at(-1)).toMatchObject({ id: ringing!.id, status: 'mission_in_progress' });
  });

  it('tap saved while another check is in progress: a fresh run picks it up', async () => {
    const ctx = await setup({ appState: 'active', path: '/today' });
    // The resume check reads the taps before the App Intent has saved one…
    jest.mocked(ctx.service.getFireEvents).mockResolvedValueOnce([ctx.went()]);
    const first = ctx.handOff.sync();
    // …then the native event asks again mid-run.
    ctx.events.push(ctx.tapped());
    const second = ctx.handOff.sync();

    expect((await first)?.status).toBe('alarm_fired');
    const latest = await second;
    expect(latest?.status).toBe('mission_in_progress');
    expect(ctx.navigate).toHaveBeenCalledTimes(1);
    expect(ctx.navigate).toHaveBeenCalledWith(latest!.id);
  });

  it('duplicate signals for the same tap (event, resume, retry) navigate only once', async () => {
    const ctx = await setup({ appState: 'inactive', path: '/today' });
    ctx.events.push(ctx.tapped());
    await Promise.all([ctx.handOff.sync(), ctx.handOff.sync()]);
    ctx.app.state = 'active';
    ctx.presenter.flush();
    ctx.presenter.flush();
    await ctx.handOff.sync();

    // Even after leaving the alarm screen, the same tap doesn't reopen it.
    ctx.app.path = '/today';
    await ctx.handOff.sync();
    ctx.presenter.flush();
    expect(ctx.navigate).toHaveBeenCalledTimes(1);
  });

  it('a launch route that gave up waiting hands over to the presenter', async () => {
    const ctx = await setup({ appState: 'active', path: '/' });
    ctx.events.push(ctx.tapped());
    const occurrence = await ctx.handOff.sync(); // Finished after the launch route chose Today.
    expect(ctx.navigate).not.toHaveBeenCalled();

    ctx.app.path = '/today';
    ctx.presenter.flush();
    expect(ctx.navigate).toHaveBeenCalledWith(occurrence!.id);
  });
});
