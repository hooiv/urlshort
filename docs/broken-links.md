# Broken links report

`GET /api/analytics/broken?workspaceId=&status=down|degraded|all&limit=50` (session or API key with `analytics:read`/`links:read`) lists active links whose last destination health probe was `down` or `degraded`. Ordered: down first, then most consecutive failures, then most human clicks in the last 7 days (traffic at risk). `lastError` is truncated to 200 chars. `truncated` means more exist than `limit` (max 200). Non-admin workspace members only see their own links; trashed and archived links are excluded.

The UI at `/manage/broken` lets you archive selected links via `/api/bulk/edit`. Probes come from the health sweep (`/api/health/sweep`) and per-link health checks.
