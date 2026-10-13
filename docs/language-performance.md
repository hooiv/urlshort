# Language performance

`GET /api/analytics/languages?workspaceId=&days=7|30|90` returns human clicks and unique visitors per browser language versus the preceding window of equal length: `language` (primary subtag, lowercase; null = Unknown), `name`, `clicks`, `visitors`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Regional variants merge (`en-GB`, `en-US` -> English). Missing or malformed values (`*`) are Unknown. Bots are excluded.
- Auth: session or API key with `analytics:read` / `links:read`; viewers only see links they can access. Rate limited to 60/min.
- UI: `/manage/languages`.
