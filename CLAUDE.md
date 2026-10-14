@AGENTS.md

## Project rules (Terbit MY)
- Read docs/ARCHITECTURE.md and docs/ROADMAP.md before starting a phase. Build one phase at a time.
- docs/ROADMAP.md is the canonical roadmap, and it holds the standing product and process rules. Take the current phase from it and from git, never from Claude Code session names, task names or old prompt titles. Other docs refer to it rather than keep their own phase lists.
- Before any phase or sub-phase, report the checkpoint (Branch, Main base, Current phase, Dependencies complete, Native build required now, Database/migration involved, Physical-device testing expected, Explicitly out of scope) and only then start feature work.
- iOS first: no Android work or Android build suggestions until Phase 7, unless Android is explicitly in scope.
- Ask for a new EAS build only when native content changes (Swift/native modules, native dependencies, entitlements, extensions, native config); Metro covers JS/TS.
- Never apply live Supabase migrations casually: explain the change, confirm scope, add tests, check RLS and rollback, and document live verification.
- Merge only after the checklist in docs/ROADMAP.md → "Process rules" (explicit merge commit, checks re-run on merged `main`, local and GitHub `main` match, clean tree).
- Screens live in `src/app/`. Feature logic goes in `src/features/<name>/`. Native features are reached only through TypeScript services in `src/services/`.
- Alarms and progress work offline first. Never put secrets in client code; only the Supabase anon key is allowed.
- Camera and microphone are optional. Ask for them only when they are used, and keep processing on the device.
- Run `npm run check` before committing.
- The project owner is a beginner on Windows. Explain setup steps in plain language.
