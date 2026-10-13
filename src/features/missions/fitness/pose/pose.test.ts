import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildMorning } from '@/features/progress/example-mornings';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { xpForMorning } from '@/features/progress/progression';
import {
  cameraPermission,
  createPoseCameraService,
  mapNativePermission,
  readAvailability,
  unavailablePoseCamera,
} from '@/services/pose';

import type { TerbitPoseNativeModule } from '../../../../../modules/terbit-pose';

import { EXERCISES } from '../exercises';
import { createFitnessSession, fitnessResult, recordCameraRep, recordRep, startFitness } from '../session';
import { FITNESS_EXERCISES, type FitnessMissionResult } from '../types';
import { CAMERA_COPY, cameraStep, canVerifyWithCamera } from './camera-flow';
import { CAMERA_ACTIVITIES, CAMERA_CATALOGUE, isCameraVerifiable } from './camera-activities';

describe('where camera verification is offered (catalogue audit, Mobility Profile)', () => {
  it('exactly the enabled activities; never Non-physical; every activity classified', () => {
    expect(FITNESS_EXERCISES.filter(isCameraVerifiable)).toEqual(['pushups', 'squats', 'jumping_jacks', 'chair_sit_to_stand']);
    expect(Object.keys(CAMERA_CATALOGUE).sort()).toEqual([...FITNESS_EXERCISES].sort());
    for (const exercise of FITNESS_EXERCISES) {
      expect(isCameraVerifiable(exercise)).toBe(CAMERA_CATALOGUE[exercise].status === 'enabled');
      if (EXERCISES[exercise].profile === 'non_physical') {
        expect(canVerifyWithCamera(exercise, true)).toBe(false);
        expect(CAMERA_CATALOGUE[exercise].status).toBe('not_suitable');
      }
      // Only rep activities: timed ones keep their timer (continuous-movement checks are a later candidate).
      if (isCameraVerifiable(exercise)) expect(EXERCISES[exercise].kind).toBe('reps');
    }
    expect(canVerifyWithCamera('stretch', true)).toBe(false);
    expect(canVerifyWithCamera('wall_push', true)).toBe(false);
    expect(CAMERA_CATALOGUE.walk_in_place.status).toBe('later');
  });

  it('each activity verifies the existing mission (same exercise id); Reduced-mobility support stays optional and forgiving', () => {
    for (const [id, activity] of Object.entries(CAMERA_ACTIVITIES)) expect(activity.exercise).toBe(id);
    expect(EXERCISES.chair_sit_to_stand.profile).toBe('reduced_mobility');
    expect(CAMERA_ACTIVITIES.chair_sit_to_stand.eitherStart).toBe(true);
  });

  it('not offered at all in a build or on a device without the camera module', () => {
    expect(unavailablePoseCamera.available).toBe(false);
    expect(canVerifyWithCamera('pushups', unavailablePoseCamera.available)).toBe(false);
  });
});

/** A stand-in for the native module, as a physical iPhone would answer. */
function fakeNative(o: { hardware?: boolean | Error; permission?: string | Error; afterRequest?: string } = {}) {
  const answer = <T,>(v: T | Error) => (v instanceof Error ? Promise.reject(v) : Promise.resolve(v));
  return {
    isCameraAvailableAsync: jest.fn(() => answer(o.hardware ?? true)),
    getCameraPermissionAsync: jest.fn(() => answer(o.permission ?? 'undetermined')),
    requestCameraPermissionAsync: jest.fn(() => answer(o.afterRequest ?? 'granted')),
  } as unknown as TerbitPoseNativeModule & Record<'isCameraAvailableAsync' | 'getCameraPermissionAsync' | 'requestCameraPermissionAsync', jest.Mock>;
}

describe('camera availability: module, hardware and permission are separate', () => {
  const View = (() => null) as never;

  it('REGRESSION: module present, camera present, never asked → "Not asked yet" (undetermined), never "unavailable"', async () => {
    const native = fakeNative();
    const a = await readAvailability(native);
    expect(a).toEqual({ module: true, hardware: true, permission: 'undetermined', errors: [] });
    expect(cameraPermission(a)).toBe('undetermined');
    expect(cameraStep(cameraPermission(a))).toBe('explain');
    expect(native.requestCameraPermissionAsync).not.toHaveBeenCalled(); // reading never asks
  });

  it('the service exists only on iOS with the module and its view', () => {
    const native = fakeNative();
    expect(createPoseCameraService('ios', native, View).available).toBe(true);
    expect(createPoseCameraService('android', native, View).available).toBe(false);
    expect(createPoseCameraService('ios', null, View).available).toBe(false);
    expect(createPoseCameraService('ios', native, null).available).toBe(false);
  });

  it('module missing → "not in this build" (not a phone limitation)', async () => {
    expect(cameraPermission(await unavailablePoseCamera.getAvailability())).toBe('not_in_build');
    expect(cameraStep('not_in_build')).toBe('unavailable');
  });

  it('a failed hardware check is NOT “no camera”: the permission still decides, and the error is kept for diagnostics', async () => {
    const a = await readAvailability(fakeNative({ hardware: new Error('boom') }));
    expect(a.hardware).toBeNull();
    expect(cameraPermission(a)).toBe('undetermined');
    expect(a.errors).toEqual(['isCameraAvailableAsync: boom']);
  });

  it('no camera hardware → no_camera; unreadable permission → unknown (the app can still try asking)', async () => {
    expect(cameraPermission(await readAvailability(fakeNative({ hardware: false })))).toBe('no_camera');
    const unread = await readAvailability(fakeNative({ permission: new Error('nope') }));
    expect(cameraPermission(unread)).toBe('unknown');
    expect(unread.errors[0]).toMatch(/getCameraPermissionAsync: nope/);
    expect(cameraStep('unknown')).toBe('explain');
  });

  it('asking uses the iOS request only when asked; denied and restricted are “denied”', async () => {
    const native = fakeNative({ afterRequest: 'restricted' });
    const service = createPoseCameraService('ios', native, View);
    expect(cameraPermission(await service.requestPermission())).toBe('denied');
    expect(native.requestCameraPermissionAsync).toHaveBeenCalledTimes(1);
    expect(mapNativePermission('denied')).toBe('denied');
    expect(mapNativePermission('weird')).toBeNull();
  });
});

describe('native module name and config consistency', () => {
  const root = join(__dirname, '..', '..', '..', '..', '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('Swift Name(...), the JS lookups, the module class and the podspec all match', () => {
    const swift = read('modules/terbit-pose/ios/TerbitPoseModule.swift');
    const js = read('modules/terbit-pose/src/TerbitPoseModule.ts');
    const config = JSON.parse(read('modules/terbit-pose/expo-module.config.json'));
    const name = /Name\("([^"]+)"\)/.exec(swift)?.[1];
    expect(name).toBe('TerbitPose');
    expect(js).toContain(`requireOptionalNativeModule<TerbitPoseNativeModule>('${name}')`);
    expect(js).toContain(`requireNativeView<TerbitPoseCameraViewProps>('${name}')`);
    expect(config).toEqual({ platforms: ['apple'], apple: { modules: ['TerbitPoseModule'] } });
    expect(swift).toContain('public class TerbitPoseModule: Module');
    expect(read('modules/terbit-pose/ios/TerbitPose.podspec')).toMatch(/s\.name\s*=\s*'TerbitPose'[\s\S]*'AVFoundation', 'Vision'/);
    // The JS module functions are the ones Swift defines.
    for (const fn of ['getCameraPermissionAsync', 'requestCameraPermissionAsync', 'isCameraAvailableAsync']) expect(swift).toContain(`AsyncFunction("${fn}")`);
  });

  it('is registered exactly like the working local modules (TerbitAlarms, TerbitScreenTime)', () => {
    const modules = [
      { dir: 'terbit-alarms', name: 'TerbitAlarms' },
      { dir: 'terbit-screen-time', name: 'TerbitScreenTime' },
      { dir: 'terbit-pose', name: 'TerbitPose' },
    ];
    for (const { dir, name } of modules) {
      const config = JSON.parse(read(`modules/${dir}/expo-module.config.json`));
      expect(config.platforms).toContain('apple');
      expect(config.apple).toEqual({ modules: [`${name}Module`] });
      const swift = read(`modules/${dir}/ios/${name}Module.swift`);
      expect(swift).toContain(`public class ${name}Module: Module`);
      expect(swift).toContain(`Name("${name}")`);
      const podspec = read(`modules/${dir}/ios/${name}.podspec`);
      expect(podspec).toContain(`s.name           = '${name}'`);
      expect(podspec).toContain(`s.dependency 'ExpoModulesCore'`);
      expect(podspec).toContain('s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"');
      expect(read(`modules/${dir}/src/${name}Module.ts`)).toContain(`requireOptionalNativeModule<${name}NativeModule>('${name}')`);
    }
  });

  it('the camera view is registered on the same module, as an ExpoView with the events JS listens to', () => {
    const module = read('modules/terbit-pose/ios/TerbitPoseModule.swift');
    const view = read('modules/terbit-pose/ios/PoseCameraView.swift');
    expect(module).toMatch(/View\(PoseCameraView\.self\) \{\s*Events\("onPose", "onCameraError"\)\s*Prop\("active"\)/);
    expect(view).toContain('final class PoseCameraView: ExpoView');
    expect(view).toContain('required init(appContext: AppContext? = nil)');
    expect(view).toContain('let onPose = EventDispatcher()');
    expect(view).toContain('let onCameraError = EventDispatcher()');
    const types = read('modules/terbit-pose/src/TerbitPose.types.ts');
    for (const prop of ['active: boolean', 'onPose?:', 'onCameraError?:']) expect(types).toContain(prop);
  });

  it('the hardware check doesn’t depend on camera permission (device discovery only)', () => {
    const swift = read('modules/terbit-pose/ios/TerbitPoseModule.swift') + read('modules/terbit-pose/ios/PoseCameraView.swift');
    const check = /AsyncFunction\("isCameraAvailableAsync"\) \{[^}]*\}/.exec(swift)?.[0] ?? '';
    expect(check).toContain('PoseCameraView.camera() != nil');
    expect(check).not.toMatch(/authorizationStatus/);
  });

  it('both build profiles (development and development-screen-time) carry the camera purpose string', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appConfig = require(join(root, 'app.config.js')) as (ctx: { config: Record<string, any> }) => Record<string, any>;
    const base = JSON.parse(read('app.json')).expo;
    const previous = process.env.TERBIT_SCREEN_TIME;
    try {
      for (const value of [undefined, '1']) {
        if (value === undefined) delete process.env.TERBIT_SCREEN_TIME;
        else process.env.TERBIT_SCREEN_TIME = value;
        expect(appConfig({ config: base }).ios.infoPlist.NSCameraUsageDescription).toBe(CAMERA_COPY.explain);
      }
    } finally {
      if (previous === undefined) delete process.env.TERBIT_SCREEN_TIME;
      else process.env.TERBIT_SCREEN_TIME = previous;
    }
  });
});

describe('camera permission and fallback', () => {
  it('explains before the first ask; denied and unavailable never block (fallback offered)', () => {
    expect(cameraStep('undetermined')).toBe('explain');
    expect(cameraStep('granted')).toBe('camera');
    expect(cameraStep('denied')).toBe('denied');
    expect(cameraStep('no_camera')).toBe('unavailable');
    expect(cameraStep(null)).toBe('checking');
    expect(CAMERA_COPY.explain).toBe('Terbit uses the camera to count exercise repetitions on your device. Video is not recorded or uploaded.');
    expect(CAMERA_COPY.denied).toMatch(/iPhone Settings → Terbit MY → Camera/);
    expect(CAMERA_COPY.fallback).toBe('Continue without camera');
  });

});

describe('mission integration: same rules, same XP, completes once', () => {
  const config = { exercise: 'squats' as const, difficulty: 'easy' as const, countdownMs: 0 };

  function complete(by: 'camera' | 'tap' | 'mixed') {
    let s = startFitness(createFitnessSession(config, 1), 0);
    let at = 0;
    for (let i = 0; s.completedAt === null; i++) {
      at += 1500;
      const useCamera = by === 'camera' || (by === 'mixed' && i % 2 === 0);
      s = (useCamera ? recordCameraRep(s, at) : recordRep(s, at)).session;
    }
    return s;
  }

  it('all reps by camera → camera_verified; any tapped rep → self-reported', () => {
    expect(fitnessResult(complete('camera'))?.verification).toBe('camera_verified');
    expect(fitnessResult(complete('tap'))?.verification).toBe('self_reported');
    expect(fitnessResult(complete('mixed'))?.verification).toBe('self_reported');
  });

  it('camera reps follow the mission rules: not before Start, the activity’s own minimum, nothing after the target', () => {
    const fresh = createFitnessSession(config, 1);
    expect(recordCameraRep(fresh, 10).outcome).toBe('not_active');
    let s = startFitness(fresh, 0);
    s = recordCameraRep(s, 1000, 800).session;
    expect(recordCameraRep(s, 1500, 800).outcome).toBe('too_fast');
    // The camera's cycle minimum (800 ms), not the 900 ms tap limit, and the tap limit itself is unchanged.
    const next = recordCameraRep(s, 1850, 800);
    expect(next.outcome).toBe('counted');
    expect(next.session.minRepIntervalMs).toBe(EXERCISES.squats.minRepIntervalMs);
    expect(recordRep(next.session, 2000).outcome).toBe('too_fast');
    const done = complete('camera');
    expect(recordCameraRep(done, done.completedAt! + 5000).outcome).toBe('not_active');
    expect(done.reps).toBe(done.target);
  });

  it('camera-verified earns exactly the same XP as self-reported (no separate XP economy)', () => {
    const base = buildMorning({ id: 'o1', alarmId: 'a', scheduledAt: Date.UTC(2026, 9, 1), outcome: 'completed', mission: { type: 'fitness', exercise: 'squats', difficulty: 'medium' } });
    if (base.result?.kind !== 'mission_completed') throw new Error('expected a completed mission');
    const mission = base.result.mission as FitnessMissionResult;
    const as = (verification: FitnessMissionResult['verification']) => ({ ...base, result: { kind: 'mission_completed' as const, mission: { ...mission, verification } } });
    const xp = xpForMorning(as('camera_verified'), PROGRESSION_POLICY);
    expect(xp).toEqual(xpForMorning(as('self_reported'), PROGRESSION_POLICY));
    expect(xp.length).toBeGreaterThan(0);
  });
});

describe('privacy and native boundaries (source checks)', () => {
  const root = join(__dirname, '..', '..', '..', '..', '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  const swift = read('modules/terbit-pose/ios/PoseCameraView.swift') + read('modules/terbit-pose/ios/TerbitPoseModule.swift');

  it('analyses frames in memory only: no recording, photo, file or network code', () => {
    expect(swift).toContain('VNDetectHumanBodyPoseRequest');
    expect(swift).toContain('AVCaptureVideoDataOutput');
    expect(swift).not.toMatch(/AVCaptureMovieFileOutput|AVCapturePhotoOutput|AVAssetWriter|FileManager|write\(to|URLSession|UIImageWriteToSavedPhotosAlbum|PHPhotoLibrary/);
  });

  it('only joint positions leave the native side', () => {
    expect(swift).toMatch(/onJoints\?\(\[\s*"at":[\s\S]*"aspect":[\s\S]*"joints": found/);
  });

  it('the pose module, its results and the camera never touch the cloud', () => {
    for (const file of ['src/features/sync/sync.ts', 'src/features/sync/mapping.ts', 'src/services/pose/index.ts']) {
      expect(read(file)).not.toMatch(/supabase|fetch\(/i);
    }
  });

  it('the iOS purpose string says what the camera is for, and nothing is uploaded', () => {
    const plist = JSON.parse(read('app.json')).expo.ios.infoPlist;
    expect(plist.NSCameraUsageDescription).toBe('Terbit uses the camera to count exercise repetitions on your device. Video is not recorded or uploaded.');
    expect(plist.NSMicrophoneUsageDescription).toBeUndefined();
  });
});
