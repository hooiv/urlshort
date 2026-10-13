# Tag performance

`GET /api/analytics/tags?workspaceId=&days=7|30|90` (session or API key with `analytics:read`/`links:read`) returns human clicks per tag for the last `days` days next to the `days` before them, with `changePct` (null when the previous window had no traffic) and `sharePct` of all tagged clicks. A link with several tags counts toward each, so shares can sum past what the links alone received. Bot and AI traffic is excluded. Up to 100 tags, busiest first; non-admin workspace members only see their own links.

UI: `/manage/tags`.
