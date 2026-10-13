# City performance

`GET /api/analytics/cities?workspaceId=&days=7|30|90` returns human clicks and unique visitors per city versus the preceding window of equal length: `city`, `country` (ISO code or null), `countryName`, `clicks`, `visitors`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Auth: session or API key with `analytics:read` / `links:read`; workspace membership required.
- City names are matched case-insensitively and whitespace-trimmed; the same name in two countries stays separate. Clicks without a city and bots are excluded (see country performance for totals).
- Members who cannot administer folders only count links they may access. Capped at 250 rows.
- UI: `/manage/cities`.
