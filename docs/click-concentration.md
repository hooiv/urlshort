# Click concentration

`GET /api/analytics/concentration?workspaceId=&days=7|30|90`

Shows how much of the human click volume (bots and AI excluded, trashed links excluded) comes from the top 1/5/10 links, how many links make up 80% of clicks, and a Gini coefficient (0 = even, near 1 = one link has everything). `level` is `none`, `diversified`, `moderate` (top link >= 30% or Gini >= 0.6) or `concentrated` (top link >= 60% or a single link). Returns the top 10 links with their share. Auth: session or API key with `analytics:read` / `links:read`. UI: `/manage/concentration`.
