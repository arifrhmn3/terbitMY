import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { migrate } from '@/services/storage/migrations';
import { createMemorySettingsStore, createSqliteSettingsStore } from '@/services/storage/settings';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

import { ACCESSIBILITY_SETTINGS_KEY, DEFAULT_ACCESSIBILITY_SETTINGS } from '../accessibility/accessibility-settings';
import { FAITH_SETTINGS_KEY } from '../faith/faith-settings';
import { PUBLIC_PROFILE_FIELDS, toPublicProfile } from '../faith/privacy';
import { createPreferenceStore } from './preference-store';
import { createAppPreferences } from './preferences-store';
import { SETTINGS_GROUPS, visibleSettingsGroups } from './settings-index';

const root = join(__dirname, '..', '..', '..');
const allRows = SETTINGS_GROUPS.flatMap((g) => g.rows);

describe('Settings index', () => {
  it('every row opens a screen that exists', () => {
    for (const row of allRows) {
      expect(existsSync(join(root, 'src', 'app', '(tabs)', 'settings', `${row.page}.tsx`))).toBe(true);
    }
  });

  it('each sub-screen appears exactly once (no duplicate entry points)', () => {
    const pages = allRows.map((r) => r.page);
    expect(new Set(pages).size).toBe(pages.length);
    expect(new Set(allRows.map((r) => r.title)).size).toBe(allRows.length);
  });

  it('is grouped Account → Alarms & missions → Notifications → Accessibility → Privacy & data → Developer', () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual(['account', 'alarms_missions', 'notifications', 'accessibility', 'privacy', 'developer']);
    expect(allRows.find((r) => r.page === 'account')?.href).toBe('/settings/account');
    expect(allRows.find((r) => r.page === 'faith')?.href).toBe('/settings/faith');
  });

  it('developer tools are only listed in development builds', () => {
    const release = visibleSettingsGroups(false);
    expect(release.flatMap((g) => g.rows).some((r) => r.devOnly)).toBe(false);
    expect(release.some((g) => g.id === 'developer')).toBe(false);
    expect(visibleSettingsGroups(true).some((g) => g.id === 'developer')).toBe(true);
  });

  it('the developer screen renders nothing useful outside development builds', () => {
    const source = readFileSync(join(root, 'src', 'app', '(tabs)', 'settings', 'developer.tsx'), 'utf8');
    expect(source).toMatch(/if \(!__DEV__\)/);
  });

  it('developer panels are no longer mixed into everyday screens', () => {
    for (const screen of ['alarms/index.tsx', 'progress/index.tsx', 'settings/account.tsx']) {
      const source = readFileSync(join(root, 'src', 'app', '(tabs)', screen), 'utf8');
      expect(source).not.toMatch(/DevPanel|NativeAlarmTest/);
    }
  });
});

describe('preferences on the phone', () => {
  it('are saved, survive a restart, and normalise damaged values', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const first = createAppPreferences(createSqliteSettingsStore(db));
    await first.accessibility.update({ mobilityProfile: 'reduced_mobility', missionPacing: 'extended' });

    const restarted = createAppPreferences(createSqliteSettingsStore(db));
    expect(restarted.accessibility.loaded()).toBe(false);
    expect(await restarted.accessibility.get()).toEqual({ mobilityProfile: 'reduced_mobility', missionPacing: 'extended' });
    expect(restarted.accessibility.loaded()).toBe(true);

    await createSqliteSettingsStore(db).set(ACCESSIBILITY_SETTINGS_KEY, { mobilityProfile: 'teleport', missionPacing: 3 });
    expect(await createAppPreferences(createSqliteSettingsStore(db)).accessibility.get()).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
  });

  it('defaults before anything is saved; accessibility has its own key, separate from Faith', async () => {
    const store = createMemorySettingsStore();
    const prefs = createAppPreferences(store);
    expect(prefs.accessibility.current()).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(prefs.accessibility.key).toBe(ACCESSIBILITY_SETTINGS_KEY);
    expect(prefs.accessibility.key).not.toBe(FAITH_SETTINGS_KEY);
    // Only what's needed is stored: no notification preference exists (Gentle follow-ups belong to Gentle mode).
    expect(Object.keys(prefs)).toEqual(['accessibility']);
    expect(await store.get(ACCESSIBILITY_SETTINGS_KEY)).toBeNull();
  });

  it('notifies subscribers and reads storage only once when loaded concurrently', async () => {
    const base = createMemorySettingsStore();
    let reads = 0;
    const store = createPreferenceStore({
      store: { get: (k) => ((reads += 1), base.get(k)), set: base.set },
      key: 'test.prefs',
      defaults: { on: false },
      normalise: (v) => ({ on: (v as { on?: unknown } | null)?.on === true }),
    });
    let calls = 0;
    store.subscribe(() => (calls += 1));
    await Promise.all([store.get(), store.get(), store.get()]);
    expect(reads).toBe(1);
    await store.update({ on: true });
    expect(store.current()).toEqual({ on: true });
    expect(calls).toBe(2);
  });
});

describe('privacy', () => {
  it('accessibility and reminder settings stay on the phone: the cloud backup never reads them', () => {
    for (const file of ['src/features/sync/sync.ts', 'src/features/sync/sync-engine.ts', 'src/services/cloud/supabase-cloud.ts']) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).not.toMatch(/accessibility|notifications\.preferences|preferences\.(accessibility|notifications)/);
    }
  });

  it('the Faith preference is still never part of anything public', () => {
    expect(PUBLIC_PROFILE_FIELDS).toEqual(['displayName', 'avatarUrl']);
    expect(toPublicProfile({ displayName: 'A', avatarUrl: null, faithPreference: 'islam' } as never)).not.toHaveProperty('faithPreference');
  });

  it('the Privacy & data screen describes guest use as local and links to the existing account controls', () => {
    const source = readFileSync(join(root, 'src', 'app', '(tabs)', 'settings', 'privacy.tsx'), 'utf8');
    expect(source).toContain('href="/settings/account"');
    expect(source).toMatch(/without an account\. Nothing is backed up/);
  });
});
