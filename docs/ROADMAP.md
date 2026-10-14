# Roadmap

**This is the canonical roadmap for Terbit MY, through iOS beta and release (Phase 6) and Android (Phase 7).** Other documents may refer to it, but they must not contradict it. If one does, this file wins and the other document gets corrected.

_Last aligned: 14 Oct 2026, with `main` at `7942c77` (Phase 6A merge)._

Phase numbers are fixed. Completed phases are never renumbered, and the Phase 6 structure below is not renumbered without an explicit decision from the owner.

## Where the project is now

| | |
|---|---|
| Last completed phase | **6A. Personalisation & onboarding** (merged into `main`, physically verified on iPhone, 14 Oct 2026) |
| Next phase | **6B. UI/UX Design Review**: **not started** |
| Later phases | 6C–6I: not started · **7. Android parity & Android beta:** deferred until iOS beta / release-readiness is stable |
| Superseded | 5C and 5D (absorbed into Phase 6; see below) |

## Before starting any phase or sub-phase (standing rule)

Before any feature work, report this checkpoint:

```
Branch:
Main base:                        (commit; working tree clean?)
Current phase:                    (from this file)
Dependencies complete:
Native build required now:
Database/migration involved:
Physical-device testing expected:
Explicitly out of scope:
```

Feature work starts only after the checkpoint. **This file and git are authoritative.** Claude Code session names, automatic task names and old prompt titles are not, and roadmap state is never inferred from them. Build one phase at a time.

## Development strategy: iOS first

Native alarms are proven on a physical iPhone and an Android phone (Phase 1). **All development is iOS first.** New features are built and tested on the iPhone. Shared logic lives in platform-neutral TypeScript, and native behaviour sits behind service interfaces (like `AlarmService`), so Android can follow later. Android code already written is kept. But no Android work (Kotlin features, Android builds, Android device testing or Google Play work) happens during Phase 6, and ordinary iOS development doesn't recommend Android builds. Android begins only in **Phase 7**, once the iOS product and its beta behaviour are stable. This avoids maintaining two mobile implementations while the product is still changing quickly.

## Standing product rules

These hold in every phase:
- **Local-first:** alarms, missions, the Main Wake-Up, snooze, the Night Routine and core progression work without internet. Cloud and social systems never block app startup.
- **Main Wake-Up:** one *resolved* Main Wake-Up per calendar date. Weekday and weekend Main Wake-Ups may coexist when their days don't overlap. Don't reintroduce a global one-Main-Wake-Up limit.
- **Mode order:** always Gentle → Reward → Challenge. Never reorder them.
- **iOS notification / Focus limits:** Terbit can't switch another app's notifications off, and can't guarantee turning on Sleep Focus through public APIs. Screen Time shielding controls app access, not notification silence. Never claim otherwise. Future Sleep Focus support means recommending the user sets it up, and possibly Shortcuts / App Shortcut help.
- **Religious content:** never AI-generate scripture, silently paraphrase it, alter canonical text or invent religious quotations. Use trusted sources and keep provenance.
- **Circles privacy:** the Circle identity is separate from the private profile. Circles never expose Faith, email, time zone, Mobility Profile, gender, sleep schedule or private settings.
- **Camera and microphone** stay optional, are asked for only when used, and are processed on the device.
- **Name and domain:** "Terbit MY" is the working name. The consumer name isn't final, no domain is bought, and no production email or domain is assumed before final branding. Technical identifiers (`terbitmy`) stay unless a real technical reason requires a change.

## Process rules

**Before merging any development phase:**
1. relevant automated tests pass;
2. `npm run check` passes;
3. Expo Doctor passes;
4. iOS export passes where applicable;
5. config validation passes where applicable;
6. cold-install / cold-cache issues are considered where relevant;
7. the git diff is reviewed;
8. no secrets or debug code remain;
9. physical iPhone verification is done where required;
10. the phase branch is committed;
11. the branch is pushed;
12. the merge uses an explicit merge commit;
13. the checks run again on the merged `main`;
14. local `main` and GitHub `main` match;
15. the working tree is clean.

**EAS builds:** don't ask for a new development build after ordinary JavaScript/TypeScript changes; Metro delivers those. A new build is normally needed only when compiled or native content changes: Swift/native modules, native dependencies, entitlements, extensions, or native app configuration.

**Database / migrations:** never apply live migrations casually. Before a migration: explain the schema change, confirm it's in the phase's scope, add tests, identify RLS implications, consider rollback and safety, and document the live verification.

---

## Phases 0–5: history (complete)

Detailed results and test records: [PROJECT_STATUS.md](../PROJECT_STATUS.md).

| Phase | Status | Delivered |
|---|---|---|
| **0. Foundation** | ✅ Complete (verified on iPhone via Expo Go) | Expo SDK 57 + TypeScript, Expo Router native tabs (Today, Alarms, Circles, Progress, Settings), theme tokens with light/dark, shared UI components, lint/typecheck/test scripts, CI, planning docs |
| **1. Alarms MVP** | ✅ Complete (iOS prototype, verified on iPhone, 11 Oct 2026) | Development builds; `terbit-alarms` native module (AlarmKit on iOS 26+); saved native alarms; Reward/Gentle/Challenge modes; one-tap alarm → mission hand-off from a closed or backgrounded app; Gentle reminders; maths mission; SQLite storage; provisional entitlement layer. Android device testing → Phase 7 |
| **2A. Progress Engine** | ✅ Complete (verified on iPhone) | XP ledger, streaks, ranks, achievements; Progress tab; Main Wake-Up vs other alarms |
| **2B. Accounts / cloud foundation** | ✅ Complete (repository side, 12 Oct 2026) | Supabase project, schema and RLS live; sign-in; offline outbox backup. Live sign-in testing deferred to beta (→ 6H) |
| **3A. Education** | ✅ Complete (verified on iPhone) | Quiz missions |
| **3B. Fitness** | ✅ Complete (verified on iPhone) | Fitness missions with non-camera alternatives |
| **3C. Faith** | ✅ Complete (verified on iPhone) | Recitation and Reflection / Meditation missions with development content; provider-neutral Reflection music ([REFLECTION-MUSIC.md](REFLECTION-MUSIC.md)). Production sources → 6D-A |
| **3D. Settings / permissions / accessibility** | ✅ Complete (verified on iPhone) | Full settings, permission centre, accessibility options, reminders |
| **3.5. Core UX consolidation** | ✅ Complete (verified on iPhone, 13 Oct 2026) | Today, alarm creation, Recent mornings placement, consistent results |
| **4. Bedtime & restrictions** | ✅ Complete (verified on iPhone in the `development-screen-time` build, 13 Oct 2026) | Night Routine: wind-down, bedtime, Screen Time restrictions from wind-down until the Main Wake-Up, "End tonight", Tonight on Today. Family Controls (Distribution) approved. No raw app-usage analytics. Android → Phase 7 |
| **4.5. Camera-verified Fitness missions** | ✅ Complete (verified on iPhone, 13 Oct 2026) | Optional "Verify with camera" with Apple Vision on the phone (no recording or upload): push-ups, squats, jumping jacks, chair sit-to-stand. Tapping always remains. Physical Chair Sit-to-Stand check → 6H |
| **5A. Live accounts & sync verification foundation** | ✅ Complete and merged (13 Oct 2026) | Expired-session fix, "Sign-in required", Sync pending / Last synced, plain-language errors, live anonymous-access probe. Live email testing deferred to beta (→ 6H) |
| **5B. Circles Foundation** | ✅ Complete and merged; live SQL security checks pass (14 Oct 2026) | Private, invite-only Circles, membership only: shareable display name, create, join by 8-character code, member list, leave, rename, delete, owner/member roles, RLS, offline cache. Signed-in testing deferred to beta (→ 6H). **Later:** ownership transfer, member removal, deep-link invites |

### 5C and 5D: SUPERSEDED / ABSORBED INTO PHASE 6

These are kept for history only. **They are not upcoming phases.** Don't build them as planned.

| Old plan | What happened to it |
|---|---|
| 5C. Check-ins & activity feed (opt-in check-ins, a Circle feed, reactions) | **No noisy real-time Circle feed.** Circle morning activity surfaces mainly through the midday **Terbitan** report (→ 6E). Sharing must stay explicit opt-in. |
| 5D. Push notifications through a Supabase Edge Function | Notifications belong to the canonical notification phase (→ 6E). |

---

## Phase 6: polish, content, monetisation & beta

### 6A. Personalisation & onboarding: ✅ COMPLETE (merged, verified on iPhone, 14 Oct 2026)

Terbit builds a routine around the user's goals, rather than behaving like another alarm clock.

Flow: 1. About you → 2. Goals → 3. Accountability mode → 4. Morning / Afternoon / Night → 5. Wake-up / snooze → 6. Sleep targets → 7. Generated weekly routine.

- Gentle → Reward → Challenge order everywhere.
- Sleep targets are separate from the Night Routine.
- Local-first; existing users are never forced into onboarding.
- Reruns update the generated alarms rather than duplicating them.
- The schedule engine is Terbit+-ready (`plan-entitlements.ts`); no monetisation is enforced yet.

Don't reopen 6A unless a regression is found. Details: PROJECT_STATUS.md → "Phase 6A".

### 6B. UI/UX Design Review: NEXT, NOT STARTED

A coherent visual system, and improvements across the whole app, through a preview-first process. **Never redesign the whole app in one pass.**

Workflow (every area):
1. audit;
2. global design direction;
3. UI Preview;
4. owner feedback;
5. revised preview;
6. explicit owner approval;
7. implementation;
8. physical verification where appropriate.

Review order (broadly):
1. global design system;
2. Today;
3. Alarms / Routines;
4. mission screens;
5. camera verification;
6. Progress;
7. Circles;
8. Settings;
9. personalisation / onboarding (starting notes: [UX-INVENTORY.md](UX-INVENTORY.md) → "Phase 6B UI Preview: screens to review");
10. Night Routine;
11. future Terbit+ surfaces;
12. final consistency / accessibility pass.

Product logic stays unchanged, unless a UX issue genuinely needs a separate product decision.

### 6C. Bahasa Melayu & localisation: NOT STARTED

Initial languages: **English** and **Bahasa Melayu**. Build a proper localisation architecture. **No scattered manual string replacement.**

Scope: onboarding, Today, alarms, missions, camera guidance, Progress, Circles, Night Routine, Settings, permissions, accounts/auth, errors, notifications, Terbit+, paywall, loading, empty and offline states.

**Religious rule:** scripture and sacred text is never casually machine-translated, paraphrased or modified. Use trusted translated sources where they apply (see 6D-A).

### 6D. Content expansion & production sources: NOT STARTED

A dedicated workstream with two tracks. **Each part gets its own scoping discussion. Don't build all of 6D at once.**

#### 6D-A. Faith content

The Phase 3C content architecture exists; production content needs trusted external sources.

- **Islam:** investigate production Quran/recitation data. Leading candidate: **UmmahAPI** (Arabic text, transliteration, Malay translation, audio/reciters, structured data). Don't assume production or commercial rights: confirm provenance, API stability, commercial-use rights, caching rights, translation attribution, audio rights, rate limits and an offline strategy before integrating.
  - **New mission type: Hadith.** Preferred source to investigate: **JAKIM myHadith** portal/data. **Don't scrape blindly.** First find out whether an API or structured data access exists, plus licensing, redistribution rights, commercial app use and attribution requirements.
  - Possible later Islam catalogue: Quran Recitation; Quran Recitation + Reflection; Hadith; Hadith Reflection; Guided Reflection.
- **Christianity:** trusted, rights-cleared scripture/API sources: canonical text, translation licensing, ideally Malay and English, clear commercial use.
- **Buddhism:** trusted or open canonical sources such as SuttaCentral, where appropriate.
- **Hinduism:** trustworthy structured scripture sources with clear translation and licensing provenance.
- **Faith Source Registry** (plan or build): provider, source name, canonical identifier, language, translation, transliteration, licence, commercial-use status, attribution, caching rights, audio rights, last validation date.
- Includes the beta gates **Faith Content Sources and Review Approval** ([FAITH-CONTENT.md](FAITH-CONTENT.md)) and **Production Reflection Music Catalogue and Licensing Approval** ([REFLECTION-MUSIC.md](REFLECTION-MUSIC.md)).

**Core rule:** Terbit never uses generative AI to invent, rewrite or silently paraphrase scripture.

#### 6D-B. Education content

Direction: **"Terbit helps users learn a little every day, at the level and in the subjects that matter to them."** Terbit isn't a measure of general intelligence. Use topic-specific **Knowledge / Mastery Levels** (Beginner, Intermediate, Advanced). For example, a user may be Investing: Beginner, General Knowledge: Advanced, Malaysian Property: Intermediate, Malaysian Civics: Beginner.

Layers:
1. **Foundation Learning:** Malaysian/SPM-aligned knowledge, mathematics, science, geography, history, vocabulary, logic, general knowledge. Ground curriculum content in reliable or official education sources where practical.
2. **Daily Brain Training:** Daily Crossword, vocabulary, logic, general knowledge, and possibly word/number puzzles later. The crossword should preferably use a verified clue-answer bank with programmatic grid generation, rather than depending on a commercial crossword database.
3. **Practical Knowledge:** progressive tracks taught in sequence. Candidates: Investing Fundamentals, Personal Finance, Malaysian Property, Malaysian Government / Political Studies / Civics, Economics, Business, Technology / AI. Example sequence for Investing: what is an equity → risk vs return → diversification → bonds → ETFs → financial statements → valuation basics.
4. **Current & Relevant Learning:** source-backed and time-aware. Examples: Bank Negara policy concepts, Budget measures, economic data, property-market trends, legislation/policy, market developments. Prefer authoritative sources: official government data, Parliament, Bank Negara Malaysia, DOSM, NAPIC, Securities Commission Malaysia, Bursa Malaysia, relevant ministries and agencies. Current facts are never treated as evergreen.

Planned content fields: topic, subtopic, mastery/difficulty, language, question type, correct answer, explanation, source, source date, freshness class, expiry/review date.

Freshness classes:
- **Evergreen:** rarely changes.
- **Curriculum / versioned:** reviewed periodically.
- **Fresh / source-backed:** needs an expiry date and revalidation.

**Daily Book Recommendation** (consumer name to be decided), fiction and non-fiction:
- Each entry may have: title, author, fiction/non-fiction, why it's worth reading, a concise original summary, main ideas or themes, key takeaways, what the work is ultimately trying to say, and an optional reflection question.
- Non-fiction focuses on arguments, ideas and conclusions. Fiction focuses on premise and themes, without spoiling the whole plot.
- **Copyright rule:** never reproduce protected book text or create chapter-by-chapter substitutes. Summaries are original, high-level and transformative. Public-domain works may be treated differently where legally appropriate.
- Before production, define the metadata source, book-cover rights, summary writing/review process, copyright policy and recommendation policy.

**Education AI rule:** AI may help draft educational content, but it's never the authoritative source. For source-backed content the chain is: verified source → extracted fact → question/lesson → answer → explanation → citation/source → freshness/review date. Political studies stay educational and institutional, never partisan. Possible areas: Federal Constitution, Parliament, executive, judiciary, federal/state structure, elections, public finance, legislation, policymaking, political history, institutions and governance.

### 6E. Notifications & Terbitan: NOT STARTED

Principle: **"Notify when the reminder can still change the outcome."** No noisy or persistent notifications.

- **Gentle:** may remind throughout the day. The exact cadence must be designed carefully, with no spam.
- **Reward:** if unfinished, remind about **1.5 hours after the Main Wake-Up**. The Reward completion window is 2 hours, so about 30 minutes remain to earn the Reward outcome.
- **Final morning opportunity:** at about **11:30 AM**, remind only users with unfinished Morning Gentle/Reward missions, where completing them can still meaningfully change morning success. No pointless reminders once the outcome can't change.
- **Night Routine:** the wind-down reminder belongs here.
- **Circles / Terbitan:** **no noisy real-time morning Circle feed.** The morning focuses on the individual. At **12:00 PM**, generate and publish the daily Circle report, **Terbitan**, and send Circle members a "Terbitan is ready" notification. Terbitan may eventually show successful and missed mornings, streaks, relevant category completion, Circle success percentage and other useful accountability metrics. The detailed social and product rules are designed before implementation.

(This absorbs the old 5C/5D plans.)

### 6F. Terbit+ & monetisation: NOT STARTED

Current entitlement direction:

| Free | Terbit+ |
|---|---|
| Gentle, Reward | Gentle, Reward, **Challenge** |
| Easy difficulty only | All difficulties |
| Limited missions | Full mission/content access |
| One basic alarm | Multiple alarms/routines |
| **No Night Routine** | Night Routine |
| | Premium and downloadable content, downloadable alarm sounds, broader premium features |

- The 6A schedule engine is already premium-ready. Don't redesign it unnecessarily.
- **Trial (intended):** 3-day free trial with payment details, converting to a monthly subscription unless cancelled.
- **Tentative pricing:** RM0.99/month, RM9.99/year.
- **Before building any App Store subscription or trial mechanics,** verify the current Apple/App Store rules, Malaysia pricing tiers, taxes and trial configuration.
- **Paywall UX:** contextual upgrade prompts (choosing Challenge, adding a second alarm, Medium/Hard, Night Routine, premium content). No constant subscription banners.

The code today still runs the provisional policies in [MONETISATION.md](MONETISATION.md) (local mock, no billing). 6F replaces them.

### 6G. Sleep / Progress polish: NOT STARTED

- Show the **Available Sleep Window**: intended bedtime → the relevant Main Wake-Up. It is **not** actual sleep, sleep quality or verified hours slept, and Terbit never claims it is.
- Possible later: Night Routine adherence, screen-free overnight window, optional Apple Health integration. Actual sleep data only from a valid integrated source.
- **Privacy rule:** Phase 4 collects no raw app-usage analytics. Don't change this casually. Investigate the Device Activity privacy restrictions before any deeper screen-use analytics.

### 6H. Beta infrastructure & deferred verification: NOT STARTED

Brings back the real-world infrastructure and testing that was deferred on purpose. Detailed checklists: PROJECT_STATUS.md → "Beta requirements" and [CLOUD.md](CLOUD.md) → "Beta-stage verification".

- **App identity:** final consumer app name, final domain, branding dependencies (when the owner decides; no domain purchase is assumed before then).
- **Auth / email** (after final branding): custom SMTP, branded auth emails, real OTP delivery, real iPhone sign-in, account UX verification.
- **Security:** real two-account / two-user RLS testing.
- **Circles:** real signed-in testing with two accounts (preferably two phones): create, rename, share invite, join, member-list privacy, leave, delete/dissolve, authenticated offline cache, cache cleared at sign-out.
- **Cloud:** new-phone restore / cloud download once built; backup/restore verification.
- **Camera:** physical Chair Sit-to-Stand test; final camera regression.
- **Permissions / device:** clean-device permission flow (alarms, notifications, camera, Screen Time); accessibility.
- **Screen Time:** regression testing, App Group, Family Controls entitlement, Activity Monitor extension, "End tonight's restrictions".
- **Expo cleanup:** inspect and remove or disconnect the duplicate Expo team project (`@arifrhmn3s-team/terbit-my`) if still applicable. The correct primary project is **`@arifrhmn3/terbit-my`**: don't touch it by accident, and don't delete anything until verified.
- **TestFlight / iOS beta:** prepare the beta build; TestFlight distribution; internal/external beta testers as appropriate; clean-device installation; a beta feedback process; crash and runtime issue collection; permissions testing on fresh installs; real-world regression testing.

6H is beta infrastructure and real testing, not App Store polish (that's 6I). It's iOS only: the Android beta is Phase 7.

### 6I. Final release polish: NOT STARTED

The final pre-release pass, iOS only (no Google Play work):
- Today hierarchy;
- terminology consistency;
- animations;
- loading states;
- empty states;
- offline states;
- failure/error states;
- accessibility;
- Dynamic Type;
- Reduce Motion;
- VoiceOver where applicable;
- performance;
- permissions;
- Gentle / Reward / Challenge order;
- Morning / Afternoon / Night terminology;
- App Store privacy language;
- final icon/logo/brand;
- subscription copy;
- onboarding length;
- final iOS beta regression;
- App Store listing/metadata readiness;
- App Store privacy labels;
- App Store screenshots / promotional assets where required;
- final release candidate review;
- App Store submission readiness.

**Analytics and privacy review.** Terbit stays privacy-conscious, and release preparation is no reason to add third-party analytics. Review:
- whether any analytics actually exist;
- what data is collected, and whether that's necessary;
- the privacy disclosures and App Store privacy labels;
- removing any development-only telemetry or debugging.

---

---

## Phase 7. Android parity & Android beta: DEFERRED

**Status:** deferred until iOS beta / release-readiness is stable. No Phase 7 work happens during Phase 6.

**Purpose:** bring the mature iOS product to Android once the iOS implementation and beta behaviour have stabilised, rather than maintaining two mobile implementations while the product is still changing quickly.

It will include:
- Android alarm parity and exact alarm behaviour (starting with an Android EAS build to recompile the Kotlin changed since Phase 1);
- Android notification behaviour;
- Android equivalents for native iOS features where possible;
- camera-verification parity;
- Night Routine / restriction behaviour appropriate to Android;
- permissions and background execution;
- local-first behaviour;
- account/cloud parity, Circles, localisation, Terbit+ and content;
- Android accessibility;
- device testing (the HONOR phone);
- Google Play internal testing;
- Google Play declarations (exact alarm, full-screen intent);
- Play Store privacy/data declarations;
- Play Store listing;
- Android beta regression.

## Where release work belongs

| Phase | Release work |
|---|---|
| **6H** | TestFlight, iOS beta distribution, real beta testing, clean-device verification |
| **6I** | App Store listing and metadata, screenshots, privacy labels, App Store privacy language, subscription copy, final release candidate, App Store submission readiness |
| **7** | Google Play internal testing, Play declarations, Play Store listing, Play Store privacy/data declarations, all other Android release work |

## Open owner decisions

None of these block the roadmap. Each is decided when its phase arrives:
- the final consumer name and domain (needed for 6H auth/email and 6I branding; no purchase until then);
- final pricing and trial, after checking the current App Store rules (6F).
