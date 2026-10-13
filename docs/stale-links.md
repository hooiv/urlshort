# Stale links

`GET /api/analytics/stale?workspaceId=&days=90&limit=50` (session or API key with `analytics:read`/`links:read`) lists active links older than `days` (30, 60, 90, 180 or 365) with no human click in that period, oldest-idle first. Bot and AI traffic does not count as activity. `idleDays` counts from the last human click, or from creation if never clicked. `truncated` means more exist than `limit` (max 200). Non-admin workspace members only see their own links.

UI: `/manage/stale` lets you select links and archive them through `/api/bulk/edit` (reversible).
