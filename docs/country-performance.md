# Country performance

`GET /api/analytics/countries?workspaceId=&days=7|30|90` returns human clicks and unique visitors per country versus the preceding window of equal length: `country` (ISO code, null = Unknown), `name`, `clicks`, `visitors`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Auth: session or API key with `analytics:read` / `links:read`; workspace membership required.
- Case variants of a code are merged; unresolvable values collapse into "Unknown". Bots are excluded.
- Members who cannot administer folders only count links they may access.
- UI: `/manage/countries`.
