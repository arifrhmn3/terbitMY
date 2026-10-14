# Monetisation Architecture (provisional)

**No billing exists.** There's no App Store purchase, Google Play Billing or RevenueCat, and no paywall. The app is structured so the model can be chosen by changing policy, not by rewriting features or the database.

**Planned direction (Phase 6F, not built):** Free = Gentle and Reward, Easy only, limited missions, one basic alarm, no Night Routine; Terbit+ = everything. Intended 3-day trial (payment details required, converts to monthly unless cancelled); tentative RM0.99/month, RM9.99/year, to be checked against the current App Store rules first. The canonical version is in [ROADMAP.md](ROADMAP.md) → 6F; the provisional policies below are what the code runs today.

## How it works

```
Screen / feature code
   └─ asks: has('challenge_mode')?             useEntitlement().has(…) / <FeatureGate feature=…>
         └─ isFeatureAvailable(feature, state, now, policy)   src/features/entitlements/entitlement.ts
               ├─ state:  free | trial | premium (+ trial dates)  ← EntitlementService (Phase 1: local mock)
               └─ policy: ACCESS_POLICY                            src/features/entitlements/policy.ts
```

- **Feature keys** (`features.ts`): `reward_mode`, `gentle_mode`, `basic_missions`, `basic_alarm_sounds`, `basic_progress`, `challenge_mode`, `premium_alarm_sounds`, `advanced_missions`, `advanced_analytics`, `social_share_templates`, `multiple_accountability_circles`, and (added in 6A for generated routines; nothing checks them yet) `multiple_alarms`, `all_difficulties`, `night_routine`.
- **Generated routines (6A):** `features/personalisation/plan-entitlements.ts` says which parts of a personalised routine would need Terbit+ (Challenge, every alarm after the one basic Main Wake-Up, Medium/Hard, premium content, Night Routine). Planned Free routine: Gentle and Reward, Easy, limited missions, one basic alarm, no Night Routine. Terbit+: the full routine. Not gated yet (gating and the paywall are Phase 6F).
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
