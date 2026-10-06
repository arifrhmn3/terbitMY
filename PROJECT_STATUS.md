# Project Status

_Last updated: 6 October 2026_

## Current phase

**Phase 0 (Foundation) is complete.** The next milestone is moving from Expo Go to an Expo development build, the first step of Phase 1. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Phase 0: Foundation ✅

| Check | Result |
|---|---|
| Project cloned and run locally on the owner's Windows computer | ✅ Done |
| npm dependencies installed (`npm install`) | ✅ Done |
| `npm run check` (lint, typecheck, unit tests) | ✅ Passes |
| `npx expo-doctor` | ✅ Passes (21/21 checks) |
| App opens on a physical iPhone through Expo Go | ✅ Done |
| Five main tabs reviewed on the device: Today, Alarms, Circles, Progress, Settings | ✅ Done |

### What Phase 0 delivered
- Expo SDK 57 + TypeScript project with Expo Router native tabs
- Theme tokens with light and dark mode, plus shared UI components
- Lint, typecheck and unit-test scripts, and a GitHub Actions CI workflow
- Planning documents: PRD, feasibility review, architecture, roadmap, Windows setup guide

### Notes from on-device testing
- If the iPhone can't reach the PC over Wi-Fi, use `npx expo start --tunnel`. Expo may offer to install `@expo/ngrok` for this. That is a local tool only and is not committed to the project.

## Next milestone: Expo development build

Not started yet. No native alarm code (AlarmKit, notification fallback or Android alarms) has been written.

Before work starts, the owner needs:
- [ ] A free Expo account (https://expo.dev/signup)
- [ ] An Apple Developer Program membership (US$99/year). This is required to install any build on a real iPhone.
- [ ] The iPhone's iOS version noted (AlarmKit needs iOS 26 or later)
- [ ] A decision on whether this Phase 0 branch becomes `main` first

A step-by-step guide (docs/DEV-BUILD.md) will be added with the development-build setup work.
