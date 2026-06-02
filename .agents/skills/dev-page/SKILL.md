---
name: dev-page
description: Start and inspect JapaneseConjugation's local Vite dev page, especially when asked to run the dev app, open the local webpage, verify the dev-only history panel, or preview older revisions from the page. Uses `npm run dev:page` and the local URL `http://127.0.0.1:5173/JapaneseConjugation/`.
---

# Dev Page

Use this skill from the repository root: `C:\Users\david\Documents\GitHub\JapaneseConjugation`.

## Workflow

1. Check local state first:
   ```powershell
   git status --short
   ```
   Do not overwrite unrelated user changes.

2. Ensure dependencies exist. If `node_modules` is missing or local npm tools are unavailable, run:
   ```powershell
   npm install
   ```

3. Start the deterministic dev page:
   ```powershell
   npm run dev:page
   ```
   The expected app URL is:
   ```text
   http://127.0.0.1:5173/JapaneseConjugation/
   ```

4. If port `5173` is already in use, check whether it is already serving this repo:
   ```powershell
   Invoke-WebRequest http://127.0.0.1:5173/JapaneseConjugation/ -UseBasicParsing
   ```
   If it is a stale Vite/Node process from this repo, stop only that process:
   ```powershell
   Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Get-Process -Id $_.OwningProcess }
   ```
   Do not stop unrelated user processes.

5. Verify the dev history API when the request involves the History panel:
   ```powershell
   Invoke-WebRequest "http://127.0.0.1:5173/__dev-history/api/revisions?limit=3" -UseBasicParsing
   ```
   The webpage should show a right-side `History` button only in local dev. It should not appear in production builds or on GitHub Pages.

6. When visual verification is needed, open `http://127.0.0.1:5173/JapaneseConjugation/` in the available browser tool and check:
   - the app loads at the `/JapaneseConjugation/` base path
   - the `History` button opens a commit drawer
   - `Restore` builds or opens a sandboxed preview
   - `Back to current` returns to the live dev app

## Report

Report the URL used, whether the dev server was newly started or already running, and any blocked port/process details. If History preview build fails for an old commit, report the panel/API error without changing the Git worktree.
