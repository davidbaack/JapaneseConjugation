# Public sentence heartbeat

`.github/workflows/supabase-heartbeat.yml` runs daily at 10:37 UTC and can be
started manually. It uses Node 24 and the existing public Supabase URL/anonymous
key secrets to run `node scripts/supabase-heartbeat.js`. It performs reads only.

Each of three ordered requests must return exactly one distinct sentence with a
known word/form, complete Japanese/English/reading structure, accepted review
metadata and a content hash matching the current lexical identity and conjugated
answer. Empty arrays, malformed rows, unapproved content, changed content and
duplicate samples fail. It uses the same content-bound approval gate as corpus
tooling; structural or hash validity does not independently prove bilingual
editorial quality.

Requests have a 15-second transport timeout and at most three attempts each.
Output records verified counts rather than response bodies or credentials.
No dependency installation or service-role key is needed.

Run `npm test -- src/__tests__/supabaseHeartbeat.test.js` for focused response,
approval, timeout-signal and retry coverage. The job verifies public content only;
it does not validate authenticated progress sync or provider behavior.

A successful run says nothing about a run that GitHub failed to schedule.
Independent freshness monitoring was deliberately left out at the user's request;
missing or delayed runs still require checking the Actions history.
