# Referrer performance

`GET /api/analytics/referrers?workspaceId=&days=7|30|90` returns human clicks and unique visitors per referring host versus the preceding window of equal length: `host`, `clicks`, `visitors`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Auth: session or API key with `analytics:read` / `links:read`; workspace membership required.
- Hosts are lowercased and `www.` is folded away. Direct traffic (no referrer) and bots are excluded.
- Members who cannot administer folders only count links they may access. Capped at 250 rows.
- UI: `/manage/referrers`.
