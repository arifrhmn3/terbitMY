import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { screenAnimation } from '@/services/accessibility';

import { PERMISSION_INFO, PERMISSION_ORDER, STATUS_LABEL } from '../permissions/permissions';
import { FOLLOWS_IPHONE, reduceMotionStatus, SYSTEM_PREFERENCES, textSizeStatus } from './system-preferences';

const root = join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

describe('Reduce Motion and text size are iPhone preferences, not permissions', () => {
  it('statuses follow what the iPhone reports', () => {
    expect(reduceMotionStatus(true)).toBe('Follows iPhone setting · On');
    expect(reduceMotionStatus(false)).toBe('Follows iPhone setting · Off');
    expect(textSizeStatus(1)).toBe('Follows iPhone setting · Default');
    expect(textSizeStatus(1.6)).toBe('Follows iPhone setting · Larger');
    expect(textSizeStatus(0.85)).toBe('Follows iPhone setting · Smaller');
  });

  it('an unknown or unsupported system value just says it follows the iPhone (never "permission needed")', () => {
    for (const status of [reduceMotionStatus(null), textSizeStatus(null), textSizeStatus(Number.NaN), textSizeStatus(0)]) {
      expect(status).toBe(FOLLOWS_IPHONE);
    }
  });

  it('nothing about them mentions permission or allowing; the help gives the real iPhone Settings paths', () => {
    for (const info of Object.values(SYSTEM_PREFERENCES)) {
      expect(JSON.stringify(info)).not.toMatch(/permission|allow/i);
    }
    expect(SYSTEM_PREFERENCES.reduce_motion.iphonePath).toBe('iPhone Settings → Accessibility → Motion → Reduce Motion');
    expect(SYSTEM_PREFERENCES.larger_text.iphonePath).toBe('iPhone Settings → Accessibility → Display & Text Size → Larger Text');
    expect(SYSTEM_PREFERENCES.larger_text.alsoPath).toMatch(/Per-App Settings → Terbit MY/);
  });

  it('the Permissions Centre lists only real permissions and capabilities', () => {
    expect(PERMISSION_ORDER).not.toContain('reduce_motion' as never);
    expect(Object.keys(PERMISSION_INFO).join()).not.toMatch(/motion|text/i);
    expect(read('src', 'app', '(tabs)', 'settings', 'permissions.tsx')).not.toMatch(/Reduce Motion|Larger Text|text size/i);
    expect(Object.values(STATUS_LABEL)).not.toContain(FOLLOWS_IPHONE);
  });

  it('the app never opens its own iPhone Settings page (or anything else) for these preferences', () => {
    const screen = read('src', 'app', '(tabs)', 'settings', 'accessibility.tsx');
    expect(screen).not.toMatch(/openSettings|Linking|systemPermissions|<Button/);
    expect(screen).not.toMatch(/Permission needed/i);
    const service = read('src', 'services', 'accessibility', 'index.ts');
    expect(service).not.toMatch(/openSettings|Linking|openURL/);
  });

  it('Reduce Motion: fade when on; the normal transition when off or not known yet', () => {
    expect(screenAnimation(true)).toBe('fade');
    expect(screenAnimation(false)).toBe('default');
    expect(screenAnimation(null)).toBe('default');
  });
});
