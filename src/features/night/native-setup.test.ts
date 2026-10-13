import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require(join(root, 'app.config.js')) as (ctx: { config: Record<string, any> }) => Record<string, any>;
const base = JSON.parse(read('app.json')).expo;

function withEnv<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.TERBIT_SCREEN_TIME;
  if (value === undefined) delete process.env.TERBIT_SCREEN_TIME;
  else process.env.TERBIT_SCREEN_TIME = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TERBIT_SCREEN_TIME;
    else process.env.TERBIT_SCREEN_TIME = previous;
  }
}

describe('Screen Time build switch (app.config.js)', () => {
  it('OFF by default: no Family Controls entitlement and no extension, so normal EAS builds still sign', () => {
    const config = withEnv(undefined, () => appConfig({ config: base }));
    expect(config).toEqual(base);
    expect(JSON.stringify(config)).not.toMatch(/family-controls|apple-targets/);
  });

  it('ON (development-screen-time profile): entitlements, the App Group, the Info.plist flag and the extension plugin', () => {
    const config = withEnv('1', () => appConfig({ config: base }));
    expect(config.ios.entitlements).toEqual({
      'com.apple.developer.family-controls': true,
      'com.apple.security.application-groups': ['group.com.terbitmy.app'],
    });
    expect(config.ios.infoPlist).toMatchObject({ TerbitScreenTimeEnabled: true, NSAlarmKitUsageDescription: expect.any(String) });
    expect(config.plugins).toContain('@bacons/apple-targets');
    expect(config.ios.bundleIdentifier).toBe('com.terbitmy.app');
    // The extension is signed by your Apple team once APPLE_TEAM_ID is filled in.
    expect(withEnv('1', () => { process.env.APPLE_TEAM_ID = 'ABCDE12345'; try { return appConfig({ config: base }); } finally { delete process.env.APPLE_TEAM_ID; } }).ios.appleTeamId).toBe('ABCDE12345');
  });

  it('eas.json has the opt-in profile; the default development profile is unchanged', () => {
    const eas = JSON.parse(read('eas.json'));
    expect(eas.build['development-screen-time']).toEqual({ extends: 'development', env: { TERBIT_SCREEN_TIME: '1', APPLE_TEAM_ID: '663JDC7J6J' } });
    expect(eas.build.development.env).toBeUndefined();
  });
});

describe('native files', () => {
  it('the app and the extension share IDENTICAL shield rules', () => {
    expect(read('targets/activity-monitor/NightShield.swift')).toBe(read('modules/terbit-screen-time/ios/NightShield.swift'));
  });

  it('the extension: a Device Activity Monitor with Family Controls and the shared App Group', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const target = require(join(root, 'targets/activity-monitor/expo-target.config.js'));
    expect(target).toMatchObject({
      type: 'device-activity-monitor',
      bundleIdentifier: '.activity-monitor',
      entitlements: { 'com.apple.developer.family-controls': true, 'com.apple.security.application-groups': ['group.com.terbitmy.app'] },
    });
    expect(read('modules/terbit-screen-time/ios/NightShield.swift')).toContain('static let appGroup = "group.com.terbitmy.app"');
  });

  it('only official Screen Time APIs: individual authorization, Apple’s picker, ManagedSettings shields, DeviceActivity schedules', () => {
    const swift = read('modules/terbit-screen-time/ios/TerbitScreenTimeModule.swift') + read('modules/terbit-screen-time/ios/AppPickerView.swift');
    expect(swift).toContain('requestAuthorization(for: .individual)');
    expect(swift).toContain('FamilyActivityPicker');
    expect(swift).toContain('DeviceActivityCenter()');
    expect(swift).not.toMatch(/dlopen|NSClassFromString|performSelector|private/i);
  });

  it('the extension shields on interval START (wind-down) and removes the shield at interval END (morning)', () => {
    const extension = read('targets/activity-monitor/DeviceActivityMonitorExtension.swift');
    expect(extension).toMatch(/override func intervalDidStart\(for activity: DeviceActivityName\) \{[^}]*NightShield\.intervalDidStart\(activity\.rawValue\)/);
    expect(extension).toMatch(/override func intervalDidEnd\(for activity: DeviceActivityName\) \{[^}]*NightShield\.intervalDidEnd\(activity\.rawValue\)/);
    const shield = read('targets/activity-monitor/NightShield.swift');
    const body = (name: string) => {
      const from = shield.indexOf(`static func ${name}(`);
      return shield.slice(from, shield.indexOf('\n  }\n', from));
    };
    // Start: a nightly schedule applies the shield (unless ended early tonight); an "end early" marker clears it.
    expect(body('intervalDidStart')).toMatch(/if isOverridden\(\) \{ return \}\s*applyShield\(\)/);
    expect(body('intervalDidStart')).toMatch(/hasPrefix\(endPrefix\)[\s\S]*clearShield\(\)/);
    // End: the shield is removed and tonight's override forgotten, so the next night is normal.
    expect(body('intervalDidEnd')).toMatch(/clearShield\(\)\s*overriddenUntil = nil/);
  });

  it('the app schedules exactly the start and end it is given (the start is wind-down, computed in TypeScript)', () => {
    const swift = read('modules/terbit-screen-time/ios/TerbitScreenTimeModule.swift');
    expect(swift).toContain('intervalStart: DateComponents(hour: night.start.hour, minute: night.start.minute, weekday: night.start.weekday)');
    expect(swift).toContain('intervalEnd: DateComponents(hour: night.end.hour, minute: night.end.minute, weekday: night.end.weekday)');
    expect(swift).toContain('repeats: true');
    // "End tonight" removes the shield without stopping any schedule or forgetting the apps.
    const endTonight = swift.slice(swift.indexOf('AsyncFunction("endTonightAsync")'), swift.indexOf('AsyncFunction("getStateAsync")'));
    expect(endTonight).toContain('NightShield.clearShield()');
    expect(endTonight).not.toMatch(/stopMonitoring|saveSelection/);
  });

  it('no notification control is attempted: Screen Time has no API for other apps’ notifications', () => {
    const swift = ['modules/terbit-screen-time/ios/TerbitScreenTimeModule.swift', 'modules/terbit-screen-time/ios/NightShield.swift', 'targets/activity-monitor/DeviceActivityMonitorExtension.swift']
      .map(read)
      .join('\n');
    expect(swift).not.toMatch(/UserNotifications|UNUserNotificationCenter|App-prefs|prefs:root/);
  });

  it('nothing about Screen Time is backed up to the cloud', () => {
    expect(read('src/features/sync/mapping.ts')).not.toMatch(/night|selection|screen/i);
  });
});
