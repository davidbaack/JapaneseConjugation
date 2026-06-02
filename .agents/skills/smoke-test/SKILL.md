---
name: smoke-test
description: Run JapaneseConjugation's quick and deploy validation gates after code changes, before commits or pushes, or when asked to smoke test, run quick tests, run deploy tests, validate a branch, or fix test failures. Runs `npm run ci:fast` and `npm run ci`, diagnoses failures, makes focused fixes, and repeats until both gates pass or an external blocker is proven.
---

# Smoke Test

## Overview

Run the repo's quick gate and deploy-grade gate, then turn failures into narrow fixes. Use this skill from the repository root: `C:\Users\david\Documents\GitHub\JapaneseConjugation`.

## Workflow

1. Inspect the worktree before running tests:
   ```powershell
   git status --short --branch
   ```
   Do not overwrite, revert, format, or stage unrelated user changes. Keep fixes scoped to failures that are part of the current task or the smoke/deploy run.

2. Ensure dependencies are installed. If local npm tools are missing or `node_modules` is absent, run:
   ```powershell
   npm ci
   ```
   If `npm ci` is blocked by local package state, report the blocker and use `npm install` only when it is the safest way to restore the checkout.

3. Run the quick gate:
   ```powershell
   npm run ci:fast
   ```
   This covers format check, lint, typecheck, and Vitest.

4. If the quick gate fails, fix and rerun until it passes:
   - For formatting failures, run `npm run format`, review the diff, and keep only relevant formatting changes.
   - For lint, typecheck, or unit-test failures, identify the smallest source or test fix, then rerun the narrow failing command before rerunning `npm run ci:fast`.
   - Do not edit `dist/`, `test-results/`, generated service-worker output, or obsolete `public/sw.js`.
   - Treat unrelated pre-existing dirty files as user work. Do not fix them unless they are the direct cause of the failing gate and the user asked this run to make the gate pass.

5. Run the deploy gate:
   ```powershell
   npm run ci
   ```
   This reruns the quick gate, then runs Playwright E2E, production build, and bundle-size validation.

6. If the deploy gate fails, fix and rerun until it passes:
   - For Playwright failures, inspect console output plus fresh `test-results/` or `playwright-report/` artifacts, then rerun the narrowest affected E2E spec when useful.
   - If port `4173` is already used, identify the listener:
     ```powershell
     Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Get-Process -Id $_.OwningProcess }
     ```
     Stop only a stale Vite preview or Node process that belongs to this repo, then rerun the gate.
   - If Playwright browsers are missing, run `npx playwright install chromium firefox webkit`, then rerun.
   - For build or PWA failures, fix source configuration such as `vite.config.js`; inspect generated output only after a build, and do not hand-edit generated files.
   - For bundle-size failures, first determine whether the growth is accidental. Reduce accidental growth when possible; adjust `scripts/check-bundle-size.js` only for intentional, deploy-safe feature growth, then rerun `npm run build`, `npm run size`, and the full `npm run ci`.

7. Repeat the fix and rerun loop until both `npm run ci:fast` and `npm run ci` pass, or until the remaining issue is a real external blocker such as missing credentials, missing browsers that cannot be installed, a locked port that cannot be safely stopped, or unrelated user changes the agent must not edit.

## Report

After the run, report:

- Result: `PASS`, `FAIL`, or `BLOCKED`.
- Commands: each quick, deploy, focused, install, or cleanup command that was run.
- Fixes: files changed and why, or `No code changes`.
- Evidence: key failing lines, fresh artifact paths, and final passing command output summary.
- Remaining blockers: exact user action needed, if blocked.

Do not treat a focused rerun as final validation. Final success requires the full deploy gate, `npm run ci`, to pass.
