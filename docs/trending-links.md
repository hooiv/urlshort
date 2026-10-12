# Trending links

`GET /api/analytics/trending?workspaceId=&days=1|7|14|30|90&direction=rising|falling&limit=10`

Ranks links by the absolute change in human clicks versus the equally long window immediately before (so "7 days" compares the last 7×24h with the 7×24h before it). Bots are excluded. Links with fewer than 5 clicks in both windows are ignored, and links are ordered by absolute gain, not percentage, so tiny links cannot crowd out real movers. `changePercent` is `null` for links with no clicks in the previous window (new traffic).

Auth: session or API key with `analytics:read`, `links:read` or `links:write`. Workspace scope respects restricted folders. Rate limit 60/min. The Analytics overview page shows the list under the KPI cards.
