# Terbit MY

A morning and night-time accountability app for iOS and Android. It covers mission-based alarms, bedtime wind-down, streaks and XP, and private accountability circles.

Built with **Expo SDK 57**, **React Native 0.86**, **TypeScript** and **Expo Router**.

## Quick start

```bash
npm install
npm start        # scan the QR code with your iPhone camera (Expo Go)
npm run web      # or preview in the browser
npm run check    # lint + typecheck + tests
```

New to this? Start with **[docs/WINDOWS-SETUP.md](docs/WINDOWS-SETUP.md)**.

## Documentation

| Doc | What it covers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements |
| [docs/FEASIBILITY.md](docs/FEASIBILITY.md) | What iOS and Android allow (alarms, Screen Time, Play policy) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Project structure and technical design |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build phases and what is needed from you in each |

## Project layout

```
src/app/            Screens & navigation (each file is a route)
  (tabs)/           Today · Alarms · Circles · Progress · Settings
src/components/     Shared UI (Screen, Section, ListRow, tab bar)
src/constants/      Theme colours, spacing
src/hooks/          Theme / colour-scheme hooks
src/lib/            Small pure helpers + unit tests
docs/               Planning documents
```
