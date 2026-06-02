# AGENTS.md

## Decision-Making Preference

- Ask the user about any non-obvious decision rather than making the call yourself. When a choice is ambiguous, has trade-offs, or isn't clearly implied by the request, pause and ask before proceeding. This applies to all agents (Codex, Claude, and Gemini).

## Repo Workflow

- For learner-facing product, UX, navigation, SRS, Library, Lessons, Practice Lab, Settings, or progress-language changes, read `.agents/app-experience.md` first. If a change goes against that design, ask the user before implementing it; when the user confirms a new direction, update `.agents/app-experience.md`.
- Check `git status --short` before editing. This worktree is often dirty; do not overwrite unrelated user changes.
- Treat this project as still in active development: optimize for the desired current product shape, and do not preserve or migrate old functionality unless the user explicitly asks for it.
- Keep learner-facing parity work narrow and grounded in the current checkout before claiming completion.
- If the user asks to refresh from remote, use `git pull --ff-only` only after local changes are safely handled.
- Do not require local tests before committing or pushing unless the user explicitly asks for testing; report any skipped validation clearly.
- After feature work is complete, commit the relevant files and push the branch, or merge to `main` when that is the agreed flow.
- Do not edit `dist/`, `test-results/`, or generated service-worker output. Current PWA behavior is configured through `VitePWA` in `vite.config.js`; treat `public/sw.js` as obsolete unless it reappears as tracked source.

## Project Skills

- `smoke-test`: Use `.agents/skills/smoke-test/SKILL.md` when asked to run smoke tests, quick tests, deploy tests, branch validation, or test-failure repair. It runs `npm run ci:fast`, then `npm run ci`, and fixes failures until the gates pass or a real external blocker is identified.
- `dev-page`: Use `.agents/skills/dev-page/SKILL.md` when asked to run, open, inspect, or verify the local Vite dev page or the dev-only History panel. It starts `npm run dev:page` and uses `http://127.0.0.1:5173/JapaneseConjugation/`.

## Common Commands

- Install dependencies: `npm install`
- Start Vite dev server: `npm run dev`
- Start deterministic dev page: `npm run dev:page`
- Fast local gate: `npm run ci:fast`
- Unit tests only: `npm test`
- E2E tests: `npm run test:e2e`
- E2E single browser in PowerShell: `$env:PW_PROJECT='chromium'; npm run test:e2e; Remove-Item Env:PW_PROJECT`
- Full local pipeline: `npm run ci`
- Deploy smoke test: `npm run ci`
- Production build: `npm run build`
- Bundle budget after build: `npm run size`
- Whitespace check: `git diff --check`
- Install missing Playwright browsers: `npx playwright install chromium firefox webkit`

## Validation Notes

- `.githooks/pre-push` may run `npm run ci:fast`; this is repo hook behavior, not a requirement to run tests manually before pushing.
- Playwright is configured to build and serve Vite preview before E2E tests, with base URL `http://localhost:4173/JapaneseConjugation/`.
- For UI, routing, or PWA changes, use served `/JapaneseConjugation/` output when validation is requested or needed, not source presence alone.
- `npm run size` reads `dist/assets`, so run `npm run build` first unless another command already produced `dist/`.
