# Shared AI limits

Anonymous coaching remains available. The Gemini proxy reserves every paid
request through the service-role-only `reserve_ai_proxy_request` database RPC.
The database locks the global daily ledger before the daily client ledger, so
workers and restarts share one quota. Failed database admission stops provider
work. All admission, transport and body reading retain the existing deadline.

The approved policy is **$5 per UTC day globally**, **100 requests per network
IP per UTC day**, and the existing burst of 10 with one token refilled every six
seconds. Shared Wi-Fi users share an allowance. These limits apply to all proxy
requests, including signed-in users; sign-in does not bypass spending limits.
Daily client keys are HMACs using the server secret and day, based on gateway
network headers. Raw IPs, prompts and account identifiers are never stored.
Missing network headers share the anonymous fallback allowance. Origin and IP
are not authenticated identities; the global cap still bounds distributed use.

The private `ai_proxy_policy` row stores the limits and pinned model tariff.
Operators can change it through privileged database access. Zero daily budget
or zero IP allowance pauses paid AI work. The default tariff for
`gemini-3.5-flash-lite` is $0.30 per million input tokens and $2.50 per million
output tokens, verified against Google's
[model pricing](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.6).
Review the tariff before a model or provider price change; a mismatched model
fails closed. No browser receives the service key or permission to alter quotas.

The budget is a conservative reservation ceiling, excluding tax and unrelated
provider traffic. Text-only payload bytes plus 4,096 framing tokens bound input;
the server output cap includes reasoning tokens per Google's
[token-limit contract](https://ai.google.dev/gemini-api/docs/thinking#token-limits-and-max_output_tokens).
External media, files, tools and cached-content references are not forwarded.
Reservations are rounded up to microdollars and are never refunded: provider
errors and timeouts can still be billed. The cap can therefore stop requests
before actual billed usage reaches $5. Each retry reserves separately.

Denied admission returns 429 with a burst/daily explanation and Retry-After.
Database failures return a safe 503. Client ledger rows expire after seven days;
global totals expire after 30 days. Expiry never resets an active daily quota.

Validation: `npm test -- src/__tests__/geminiProxy.test.js` covers anonymous
admission, private daily hashes, denials, fail-closed errors, stalled admission,
and text/byte bounds. `supabase/tests/ai_proxy_budget.sql` checks actual SQL
accounting, access restrictions and thresholds inside a rolled-back transaction.
Apply the migration before deploying the proxy; an absent RPC blocks paid work.
