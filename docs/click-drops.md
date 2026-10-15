# Click drops

`GET /api/analytics/drops?workspaceId=&windowHours=6|24|72&limit=25`

The mirror of click spikes. Flags active links that normally earn at least 20 human clicks per window (averaged over the preceding 14 days) but whose last `windowHours` came in at 40% or less of that. Severity: `dip` (<=40%), `drop` (<=15%), `silent` (zero clicks). Ranked by clicks lost. Usually means a broken campaign, dead destination or removed placement. Bot and AI traffic is excluded. Auth: session or API key with `analytics:read` / `links:read`. UI: `/manage/drops`.
