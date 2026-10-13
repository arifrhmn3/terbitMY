/**
 * Device Activity Monitor extension (Phase 4, night restrictions). iOS runs it
 * at each night schedule's start and end, even when Terbit MY is closed, and
 * it shields or un-shields the apps chosen in Apple's picker.
 *
 * Only included in builds made with TERBIT_SCREEN_TIME=1 (see app.config.js),
 * because it needs Apple's Family Controls capability on its own bundle ID
 * (Family Controls Distribution: approved for com.terbitmy.app.activity-monitor).
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'device-activity-monitor',
  name: 'TerbitActivityMonitor',
  bundleIdentifier: '.activity-monitor',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity', 'ManagedSettings', 'FamilyControls'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.terbitmy.app'],
  },
};
