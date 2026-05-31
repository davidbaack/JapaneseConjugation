# AGENTS.md

## Repo Workflow

- Check `git status --short` before editing. This worktree is often dirty; do not overwrite unrelated user changes.
- Keep learner-facing parity work narrow and validate against the current checkout before claiming completion.
- If the user asks to refresh from remote, use `git pull --ff-only` only after local changes are safely handled.
- Before committing non-trivial changes, run the deploy smoke test with `npm run ci`.
- After feature work is complete and validated, commit the relevant files and push the branch, or merge to `main` when that is the agreed flow.
- Do not edit `dist/`, `test-results/`, or generated service-worker output. Current PWA behavior is configured through `VitePWA` in `vite.config.js`; treat `public/sw.js` as obsolete unless it reappears as tracked source.

## Common Commands

- Install dependencies: `npm install`
- Start Vite dev server: `npm run dev`
- Fast pre-push gate: `npm run ci:fast`
- Unit tests only: `npm test`
- E2E tests: `npm run test:e2e`
- E2E single browser in PowerShell: `$env:PW_PROJECT='chromium'; npm run test:e2e; Remove-Item Env:PW_PROJECT`
- Full local pipeline: `npm run ci`
- Deploy smoke test before commit: `npm run ci`
- Production build: `npm run build`
- Bundle budget after build: `npm run size`
- Whitespace check: `git diff --check`
- Install missing Playwright browsers: `npx playwright install chromium firefox webkit`

## Validation Notes

- `.githooks/pre-push` runs `npm run ci:fast`; use `npm run ci` when the change needs E2E, production build, and bundle-size coverage.
- Playwright is configured to build and serve Vite preview before E2E tests, with base URL `http://localhost:4173/JapaneseConjugation/`.
- For UI, routing, or PWA changes, verify served `/JapaneseConjugation/` output with a build/E2E or preview check, not source presence alone.
- `npm run size` reads `dist/assets`, so run `npm run build` first unless another command already produced `dist/`.
