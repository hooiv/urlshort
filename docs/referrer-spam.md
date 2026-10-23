# Referrer spam report

`GET /api/analytics/referrer-spam?workspaceId=&days=7|30|90[&format=csv]` (session or API key with `analytics:read`/`links:read`).

Flags referring hosts among human-classified clicks by signal: `known-spam` (curated network list, subdomains included),
`single-source` (>=20 clicks, visitors/clicks <= 0.1) and `burst` (>=20 clicks, none in the previous window, >=40% share).
Returns `flagged`, `spamClicks`, `totalReferredClicks`, `spamSharePct`. Viewers only see links they may access.
