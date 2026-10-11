# Monetisation Architecture (provisional)

**No billing exists.** There's no App Store purchase, Google Play Billing or RevenueCat, and no paywall. The business model **hasn't been decided**. The app is structured so either model below can be chosen during beta by changing policy, not by rewriting features or the database.

## How it works

```
Screen / feature code
   └─ asks: has('challenge_mode')?             useEntitlement().has(…) / <FeatureGate feature=…>
         └─ isFeatureAvailable(feature, state, now, policy)   src/features/entitlements/entitlement.ts
               ├─ state:  free | trial | premium (+ trial dates)  ← EntitlementService (Phase 1: local mock)
               └─ policy: ACCESS_POLICY                            src/features/entitlements/policy.ts
```

- **Feature keys** (`features.ts`): `reward_mode`, `gentle_mode`, `basic_missions`, `basic_alarm_sounds`, `basic_progress`, `challenge_mode`, `premium_alarm_sounds`, `advanced_missions`, `advanced_analytics`, `social_share_templates`, `multiple_accountability_circles`.
- **No scattered premium checks.** Screens never test "is premium". Alarms don't store "premium required": `requiredFeatures(alarm)` works out what an alarm relies on from its settings (`src/features/alarms/alarm-features.ts`).
- **Alarms always ring.** If an alarm's saved mode isn't available (for example a trial ended), it behaves as Reward (`effectiveCompletionMode`). The saved setting is kept and comes back with access. The same applies to sounds.
- **Entitlement source:** `EntitlementService` (`src/services/entitlements`). Phase 1 uses a local mock saved in SQLite (`app_settings`), switchable under Alarms → "Test plan (developer)" in development builds. A store-backed implementation can replace it later behind the same interface.

## Provisional policies (`policy.ts`)

| | Model A: Freemium *(current)* | Model B: Full app with trial |
|---|---|---|
| New user | Free | 7-day trial, everything unlocked |
| Free / after trial | Reward, Gentle, basic missions, basic sounds, basic progress | Reward + basic sounds only (so alarms keep working) |
| Trial | Everything (optional) | Everything |
| Premium | Everything | Everything |

To test Model B, set `ACCESS_POLICY = TRIAL_POLICY`. All of these are beta assumptions: which modes are free, whether Challenge is premium, trial length, and what remains after a trial.

## Prepared but not built

- **Alarm sounds** (`src/features/alarms/sounds.ts`): a catalog with basic/premium tiers. Only the system default exists, with no copyrighted music.
- **Share cards** (`src/features/sharing/share-cards.ts`, `src/services/sharing`): card kinds (streak, rank, monthly consistency, challenge, yearly recap), private by default (mission details and alarm times only if opted in), and branded templates gated by `social_share_templates`. Rendering and the native share sheet are future work.
