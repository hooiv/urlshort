# Device, browser and OS performance

`GET /api/analytics/tech?workspaceId=&dimension=device|browser|os&days=7|30|90` returns human clicks and unique visitors per device type, browser or operating system versus the preceding window of equal length: `value` (null = Unknown), `label`, `clicks`, `visitors`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Auth: session or API key with `analytics:read` / `links:read`; workspace membership required.
- Values differing only by case/whitespace are merged; blanks become "Unknown". Bots are excluded. Max 100 rows.
- Members who cannot administer folders only count links they may access.
- UI: `/manage/tech`.
