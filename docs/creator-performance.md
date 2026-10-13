# Creator performance

`GET /api/analytics/creators?workspaceId=&days=7|30|90` returns, per link owner: `totalLinks`, `newLinks` (created in the window), human `clicks`, `previousClicks` (preceding window of equal length), `changePct` (null without prior traffic) and `sharePct`.

- Names fall back to the email local part, never the full address. Bots are excluded.
- Auth: session or API key with `analytics:read` / `links:read`; viewers only see links they can access. Rate limited to 60/min.
- UI: `/manage/creators`.
