@AGENTS.md

## Project rules (Terbit MY)
- Read docs/ARCHITECTURE.md and docs/ROADMAP.md before starting a phase. Build one phase at a time.
- Screens live in `src/app/`. Feature logic goes in `src/features/<name>/`. Native features are reached only through TypeScript services in `src/services/`.
- Alarms and progress work offline first. Never put secrets in client code; only the Supabase anon key is allowed.
- Camera and microphone are optional. Ask for them only when they are used, and keep processing on the device.
- Run `npm run check` before committing.
- The project owner is a beginner on Windows. Explain setup steps in plain language.
