/* eslint-disable @typescript-eslint/no-require-imports -- the app is loaded fresh for every test (jest.resetModules), so modules are required inside the tests. */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

/*
 * Regression for the Phase 6A iPhone bug "Build my Terbit routine opens a
 * blank screen". These render the REAL screens with the REAL stores on a
 * real (Node) SQLite database inside a real native-stack navigator. Only the
 * imperative router, CSS and Faith audio content are replaced.
 */

jest.mock('@/global.css', () => ({}));
jest.mock('@/services/storage/database', () => {
  const { openTestDatabase } = jest.requireActual<typeof import('@/services/storage/testing/node-sqlite')>('@/services/storage/testing/node-sqlite');
  const { migrate } = jest.requireActual<typeof import('@/services/storage/migrations')>('@/services/storage/migrations');
  const db = openTestDatabase();
  const ready = migrate(db).then(() => db);
  return { getDatabase: () => ready };
});
jest.mock('@/features/faith/faith', () => {
  const { createFaithSettingsStore } = jest.requireActual<typeof import('@/features/faith/faith-settings')>('@/features/faith/faith-settings');
  const { createMemorySettingsStore } = jest.requireActual<typeof import('@/services/storage/settings')>('@/services/storage/settings');
  return { faith: { settings: createFaithSettingsStore(createMemorySettingsStore()), prepareAhead: async () => {} } };
});
const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: mockRouter,
  // Focus effects need Expo Router's own root; here the screen is simply focused once.
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));

type Mods = {
  alarms: typeof import('@/features/alarms/alarms');
  alarm: typeof import('@/features/alarms/alarm');
  night: typeof import('@/features/night/night');
  nightRoutine: typeof import('@/features/night/night-routine');
  personalisation: typeof import('./personalisation');
  getDatabase: typeof import('@/services/storage/database').getDatabase;
  settings: typeof import('@/services/storage/settings');
  React: typeof import('react');
  renderer: typeof import('react-test-renderer');
};

let mods: Mods;
let errors: string[];
const mounted: ReactTestRenderer[] = [];

beforeEach(() => {
  // A fresh app (and a fresh database) per test.
  jest.resetModules();
  mods = {
    alarms: require('@/features/alarms/alarms'),
    alarm: require('@/features/alarms/alarm'),
    night: require('@/features/night/night'),
    nightRoutine: require('@/features/night/night-routine'),
    personalisation: require('./personalisation'),
    getDatabase: require('@/services/storage/database').getDatabase,
    settings: require('@/services/storage/settings'),
    // The same React the freshly loaded screens use.
    React: require('react'),
    renderer: require('react-test-renderer'),
  };
  errors = [];
  jest.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a.map(String).join(' ')));
  Object.values(mockRouter).forEach((f) => f.mockClear());
  mockRouter.canGoBack.mockReturnValue(true);
});

afterEach(async () => {
  // Unmount everything so no screen keeps running after its test.
  for (const tree of mounted.splice(0)) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

async function seedExistingUser() {
  await mods.alarms.alarmStore.load();
  await mods.alarms.alarmStore.save(mods.alarm.createAlarmDraft({ isPrimary: true, weekdays: [1, 2, 3, 4, 5] }));
  await mods.night.nightStore.save(mods.nightRoutine.createNightRoutineDraft());
}

async function setRaw(key: string, value: unknown) {
  await mods.settings.createSqliteSettingsStore(await mods.getDatabase()).set(key, value);
}

const act = (fn: () => Promise<void>) => mods.renderer.act(fn);
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 50))));

/** Lets the screen finish loading (a busy test machine can take longer than one flush). */
async function settle(tree: ReactTestRenderer, untilLoaded: boolean) {
  await flush();
  for (let i = 0; untilLoaded && i < 100 && text(tree).includes('Preparing your routine…'); i++) await flush();
}

/** Renders a route component the way the app does: inside the root native stack, as a full-screen modal. */
async function renderRoute(name: string, component: ComponentType, untilLoaded = true): Promise<ReactTestRenderer> {
  const { NavigationContainer } = require('expo-router/build/react-navigation/native');
  const { createNativeStackNavigator } = require('expo-router/build/react-navigation/native-stack');
  const Stack = createNativeStackNavigator();
  let tree!: ReactTestRenderer;
  await act(async () => {
    const h = mods.React.createElement;
    tree = mods.renderer.create(
      h(NavigationContainer, null, h(Stack.Navigator, { screenOptions: { headerShown: false } }, h(Stack.Screen, { name, component, options: { presentation: 'fullScreenModal', gestureEnabled: false } }))),
    );
  });
  mounted.push(tree);
  await settle(tree, untilLoaded);
  return tree;
}

const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

/** Taps the control whose label is `title`. */
async function press(tree: ReactTestRenderer, title: string, untilLoaded = true) {
  const label = tree.root.findAll((n) => typeof n.type === 'string' && Array.isArray(n.children) && n.children.includes(title))[0];
  if (!label) throw new Error(`No "${title}" on screen`);
  let node: ReactTestInstance | null = label;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`"${title}" isn't tappable`);
  await act(async () => {
    await node!.props.onPress();
  });
  await settle(tree, untilLoaded);
}

const Personalise = () => require('@/app/personalise').default as ComponentType;

describe('opening personalisation never shows a blank screen', () => {
  it('existing user: Settings → Personalise Terbit → Build my Terbit routine → the first step renders', async () => {
    await seedExistingUser();
    const settings = await renderRoute('settings/personalise', require('@/app/(tabs)/settings/personalise').default);
    expect(text(settings)).toContain('Not personalised yet');
    await press(settings, 'Build my Terbit routine');
    expect(mockRouter.push).toHaveBeenCalledWith('/personalise');

    const flow = await renderRoute('personalise', Personalise());
    const shown = text(flow);
    expect(shown).toContain('About you');
    expect(shown).toContain('Gender');
    expect(shown).toContain('Close');
    expect(shown).toContain('Skip');
    expect(shown).toContain('Continue');
    expect(errors).toEqual([]);
    // Opening changed nothing.
    expect(mods.alarms.alarmStore.getState().alarms).toHaveLength(1);
    expect(await mods.personalisation.personalisation.state()).toMatchObject({ audience: 'existing', status: 'not_started' });
  });

  it('works with no stored personalisation state at all', async () => {
    const flow = await renderRoute('personalise', Personalise());
    expect(text(flow)).toContain('About you');
    expect(errors).toEqual([]);
  });

  it('resumes an interrupted session at its step', async () => {
    const { personalisation } = mods.personalisation;
    const draft = await personalisation.begin();
    await personalisation.saveDraft({ ...draft, step: 'wake' });
    const flow = await renderRoute('personalise', Personalise());
    expect(text(flow)).toContain('Your wake-up');
  });

  it('an empty or corrupt saved session falls back to a clean one', async () => {
    for (const bad of [{}, { version: 1, step: 'nowhere' }, 'garbage', { version: 1, step: 'goals', answers: 42, baseline: null }]) {
      await setRaw('personalisation.draft', bad);
      const flow = await renderRoute('personalise', Personalise());
      const shown = text(flow);
      expect([bad, shown.includes('About you') || shown.includes('Your goals')]).toEqual([bad, true]);
      expect(errors).toEqual([]);
      await act(async () => flow.unmount());
      mounted.splice(mounted.indexOf(flow), 1);
    }
  });

  it('a session that can’t be read at all still opens cleanly', async () => {
    const { personalisation } = mods.personalisation;
    const db = await mods.getDatabase();
    const original = db.getFirstAsync.bind(db);
    jest.spyOn(db, 'getFirstAsync').mockImplementation(((sql: string, ...args: unknown[]) =>
      typeof args[0] === 'string' && args[0] === 'personalisation.draft' ? Promise.reject(new Error('disk')) : original(sql, ...(args as []))) as never);
    expect((await personalisation.begin()).step).toBe('about');
  });

  it('shows a loading view (with Close) while the session loads', async () => {
    const { personalisation } = mods.personalisation;
    jest.spyOn(personalisation, 'begin').mockImplementation(() => new Promise(() => {}));
    const flow = await renderRoute('personalise', Personalise(), false);
    expect(text(flow)).toContain('Preparing your routine…');
    await press(flow, 'Close', false);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows an error view with Start again and Close when opening fails', async () => {
    const { personalisation } = mods.personalisation;
    const begin = jest.spyOn(personalisation, 'begin').mockRejectedValueOnce(new Error('Broken store.'));
    const flow = await renderRoute('personalise', Personalise());
    expect(text(flow)).toContain('Personalisation couldn’t open');
    expect(text(flow)).toContain('Broken store.');
    begin.mockRestore();
    await press(flow, 'Start again');
    expect(text(flow)).toContain('About you');
  });

  it('Close always leaves: back to Settings, or Today when opened on first launch', async () => {
    const { leave } = require('@/app/personalise');
    leave();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    mockRouter.canGoBack.mockReturnValue(false);
    leave();
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/today');
  });

  it('Close inside the flow asks first, then leaves without changing anything', async () => {
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const flow = await renderRoute('personalise', Personalise());
    await press(flow, 'Close');
    const [title, , buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => Promise<void> }[]];
    expect(title).toBe('Use Terbit without personalising?');
    await act(async () => {
      await buttons.find((b) => b.text === 'Skip personalisation')!.onPress!();
    });
    expect(mockRouter.back).toHaveBeenCalled();
    expect((await mods.personalisation.personalisation.state()).status).toBe('skipped');
  });

  it('Back moves to the previous step', async () => {
    const flow = await renderRoute('personalise', Personalise());
    await press(flow, 'Continue');
    expect(text(flow)).toContain('Your goals');
    await press(flow, 'Back');
    expect(text(flow)).toContain('About you');
  });

  it('a drawing error shows the route error boundary with Close, not a blank screen', async () => {
    const { ErrorBoundary } = require('@/app/personalise');
    const tree = await renderRoute('personalise', () => mods.React.createElement(ErrorBoundary, { error: new Error('Boom'), retry: async () => {} }));
    expect(text(tree)).toContain('Personalisation couldn’t open');
    expect(text(tree)).toContain('Close');
  });

  it('fresh install: offered once, and the first step renders', async () => {
    const { personalisation } = mods.personalisation;
    expect(await personalisation.takeAutoOffer()).toBe(true);
    const flow = await renderRoute('personalise', Personalise());
    expect(text(flow)).toContain('About you');
    expect(await personalisation.takeAutoOffer()).toBe(false);
  });

  it('the modal draws its own top bar (no native header, like the alarm screen)', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'app', 'personalise.tsx'), 'utf8');
    expect(source).not.toMatch(/headerShown: true|headerLeft|headerRight|Stack\.Screen/);
    expect(source).toMatch(/SafeAreaView/);
  });
});

describe('loadSession', () => {
  it('resolves, fails, or times out: never waits forever', async () => {
    const { loadSession } = require('./session');
    const draft = { step: 'about' };
    expect(await loadSession(async () => draft)).toEqual({ status: 'ready', draft });
    expect(await loadSession(async () => Promise.reject(new Error('x')))).toEqual({ status: 'error', message: 'x' });
    expect(await loadSession(() => new Promise(() => {}), 10)).toEqual({ status: 'error', message: 'Personalisation took too long to open.' });
  });
});
