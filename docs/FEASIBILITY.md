# Feasibility Review: Platform Capabilities

Checked on **5 October 2026**.

- Apple and Android developer documentation was read directly.
- The Google Play policy pages and the Expo docs/pricing pages could not be fetched from the build environment. Those points come from search-result extracts of the official pages and are marked *(extract)*.
- Points from community sources are marked *(unverified)*.
- **Re-check every point marked like this before the matching phase starts.**

Legend: ✅ feasible · ⚠️ feasible, but needs a permission, an approval or has a catch · ❌ not possible or not guaranteed

---

## 1. iOS alarms: AlarmKit

| | |
|---|---|
| Availability | **iOS 26.0+** (announced at WWDC25). Needs Xcode 26, which EAS cloud builds provide. |
| Permission | The user grants alarm permission. `NSAlarmKitUsageDescription` must be in Info.plist and must not be empty. **No special entitlement and no Apple approval needed.** |
| Can do | ✅ One-off and weekly alarms, plus countdowns. ✅ Rings through **silent mode and Focus**. ✅ Lock Screen, Dynamic Island, StandBy and Apple Watch UI. ✅ Custom sound. ✅ A secondary button can run an App Intent that **opens the app** so the user can start the mission. |
| Catches | ⚠️ A countdown or snooze UI needs a Widget/Live Activity extension, which is an extra native target. ⚠️ The intent only runs after the phone has been unlocked once since boot. |
| ❌ Not guaranteed | **The system "Stop" button is always there.** A user can dismiss the alarm without finishing the mission. Terbit can only *encourage* the mission: for example by re-alarming after a few minutes if no mission is logged, by giving XP and streak penalties, and through circle visibility. |

**Older iOS (17–25):** the fallback is local notifications.
- Sounds are at most 30 s, and the notifications **do not ring through silent mode**.
- Breaking through silent mode needs Apple's *Critical Alerts* entitlement. Apple rarely grants it to alarm apps *(unverified)*.
- **Decision:** full alarm experience on iOS 26+. Best-effort notification alarms on iOS 17–25, with a clear in-app warning ("keep ringer on").

## 2. Android alarms: exact alarms

| | |
|---|---|
| API | `AlarmManager.setAlarmClock()` is never deferred and fires through Doze. ✅ |
| Permission | ⚠️ `USE_EXACT_ALARM` (Android 13+) is granted at install, but it is **restricted by Google Play** to apps whose *core function* is an alarm clock, timer or calendar. A Play Console declaration is required *(extract)*. Terbit qualifies only if the alarm clock is clearly its core feature. `SCHEDULE_EXACT_ALARM` covers Android 12. On Android 14+ that permission is denied by default and the user turns it on in Settings, so we use it only as a fallback. |
| Full-screen alarm | ⚠️ `USE_FULL_SCREEN_INTENT` on Android 14+ is only auto-granted to calling and alarm apps, and needs a Play declaration *(extract)*. |
| Other | Alarms must be re-scheduled after a reboot (`BOOT_COMPLETED`). Sound plays from a typed foreground service. |
| ❌ Not guaranteed | Aggressive battery managers (some Xiaomi, Oppo, Samsung settings) can still kill alarms *(unverified)*. We will add an onboarding step that shows how to exempt the app. |

## 3. iOS app restrictions: Screen Time API (FamilyControls, ManagedSettings, DeviceActivity)

| | |
|---|---|
| Availability | iOS 16+ for **individual** (self) authorisation. The user confirms with Face ID or passcode. ✅ |
| Approval | ⚠️ **Development** entitlement: available to any paid Apple Developer account. ⚠️ **App Store distribution** needs the *Family Controls (Distribution)* entitlement. The Account Holder must request it from Apple **for the app and for each extension**. Developers report waits from days to about 3 weeks *(unverified)*. **Request early (Phase 0/1).** |
| Native work | Three app extensions: **DeviceActivityMonitor** (starts and ends the bedtime window), **ShieldConfiguration** (the blocking screen's look) and **ShieldAction** (the blocking screen's buttons), plus an App Group. Possible in Expo through a config plugin. The community library `react-native-device-activity` already does this. |
| Privacy model | Apps are chosen in Apple's picker. Terbit only receives **opaque tokens**: it can never see which apps the user picked. ✅ Good for privacy. |
| ❌ Not guaranteed | The user can revoke authorisation in Settings at any time. Self-imposed limits are a commitment device, not a lock. |

## 4. Android app restrictions

| Approach | Verdict |
|---|---|
| `UsageStatsManager` (`PACKAGE_USAGE_STATS`, special access the user grants) to detect the foreground app, plus a full-screen "bedtime" screen or overlay (`SYSTEM_ALERT_WINDOW`) | ⚠️ **Recommended.** Needs a prominent disclosure. Policy risk is moderate. |
| `AccessibilityService` | ⚠️/❌ **Avoid.** Play limits non-accessibility use. The app must not set `isAccessibilityTool`. Android 17 Advanced Protection revokes it for non-tools *(extract)*. High rejection risk. |
| `QUERY_ALL_PACKAGES` | ❌ Avoid. Use a `<queries>` launcher intent filter instead. |
| Digital Wellbeing integration | ❌ No public API *(unverified)*. |
| Guarantee | ❌ This is soft blocking. The user can revoke the special access. |

## 5. Expo native modules and cloud builds

| | |
|---|---|
| SDK | **Expo SDK 57** (React Native 0.86, React 19.2) is the current stable release and is what this repo uses. SDK 58 (iOS 27 support) is in beta. Upgrade when it is stable. |
| Native code | ✅ Expo Modules API: `npx create-expo-module@latest --local` creates Swift and Kotlin code under `modules/` behind one TypeScript API. Config plugins add Info.plist keys, entitlements and manifest entries. App extensions are added with an Apple-targets config plugin. |
| Expo Go | ❌ Cannot load our custom native code (AlarmKit, Screen Time, exact alarms). From Phase 1 we need a **development build** (`expo-dev-client`). Expo Go still works for previewing UI until then. |
| Building from Windows | ✅ **EAS Build** builds iOS in the cloud, so no Mac is needed. Free tier: about 15 iOS and 15 Android builds a month in a low-priority queue *(extract)*. |
| Accounts needed | Expo account (free). **Apple Developer Program, US$99/yr**: needed to install builds on a real iPhone, for TestFlight and the App Store, and for Screen Time entitlements. **Google Play Console, US$25 once.** |
| Testing | AlarmKit and Screen Time must be tested on a **real iPhone running iOS 26+**. Simulators are not reliable for these *(unverified)*. |

---

## Summary

| Capability | iOS | Android | Approval needed |
|---|---|---|---|
| Alarms that ring through silent mode | ✅ iOS 26+, ⚠️ older | ✅ | Play exact-alarm and full-screen-intent declarations |
| Forcing the mission before dismissal | ❌ (system Stop button) | ⚠️ (we own the screen, but the user can still force-stop) | — |
| Camera rep counting on device | ✅ | ✅ | User permission only |
| Bedtime app blocking | ✅ (soft) | ⚠️ (soft, policy risk) | **Apple Family Controls Distribution**; Play disclosures |
| Supabase sync | ✅ | ✅ | — |

## Sources
- AlarmKit: https://developer.apple.com/documentation/alarmkit, https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit, https://developer.apple.com/videos/play/wwdc2025/230/
- Notification sounds and critical alerts: https://developer.apple.com/documentation/usernotifications/unnotificationsound, https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts
- Android alarms: https://developer.android.com/develop/background-work/services/alarms, https://developer.android.com/about/versions/14/changes/schedule-exact-alarms, https://source.android.com/docs/core/permissions/fsi-limits
- Play policy: https://support.google.com/googleplay/android-developer/answer/13392821, https://support.google.com/googleplay/android-developer/answer/10964491
- Screen Time: https://developer.apple.com/documentation/familycontrols, https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.family-controls, https://developer.apple.com/documentation/deviceactivity, https://github.com/kingstinct/react-native-device-activity
- Package visibility: https://developer.android.com/training/package-visibility/declaring
- Expo: https://expo.dev/changelog/sdk-57, https://docs.expo.dev/modules/get-started/, https://expo.dev/pricing
