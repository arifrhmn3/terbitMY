/**
 * Terbit MY app config. app.json holds the settings; this file only adds the
 * Screen Time pieces (Phase 4 night restrictions) when the build asks for them.
 *
 * WHY A SWITCH: the Family Controls capability is signed into a build only
 * when asked for. Apple has approved "Family Controls (Distribution)" for the
 * app AND the extension (13 Oct 2026). Screen Time builds use the
 * `development-screen-time` profile in eas.json, which sets
 * TERBIT_SCREEN_TIME=1. The normal `development` profile leaves it out
 * (Night Routine still works; restrictions say "not in this build").
 */
const APP_GROUP = 'group.com.terbitmy.app';

module.exports = ({ config }) => {
  if (process.env.TERBIT_SCREEN_TIME !== '1') return config;
  return {
    ...config,
    ios: {
      ...config.ios,
      // The extension is signed with the same Apple team as the app (Team ID from
      // developer.apple.com → Membership; set APPLE_TEAM_ID in eas.json).
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.developer.family-controls': true,
        'com.apple.security.application-groups': [APP_GROUP],
      },
      infoPlist: { ...config.ios?.infoPlist, TerbitScreenTimeEnabled: true },
    },
    // Adds the Device Activity Monitor extension in targets/activity-monitor.
    plugins: [...(config.plugins ?? []), '@bacons/apple-targets'],
  };
};
