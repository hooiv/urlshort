# Technology performance

`GET /api/analytics/tech?workspaceId=&dimension=browser|os|device&days=7|30|90` returns human clicks and unique visitors per browser, operating system or device type versus the preceding window of equal length: `value` (null = Unknown), `name`, `clicks`, `visitors`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Bots are excluded. Max 100 rows. Auth: session or API key with `analytics:read` / `links:read`; viewers only see links they can access. Rate limited to 60/min.
- UI: `/manage/tech`.
