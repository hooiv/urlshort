# Burst vs evergreen

`GET /api/analytics/lifespan?workspaceId=&limit=25`

For active links with at least 50 human clicks and a first click at least 7 days old, returns the share of clicks in the first 48 hours of traffic (`earlyShare`). Pattern: `burst` (>=70%), `balanced`, `evergreen` (<=25%). Sorted most front-loaded first. Bot and AI traffic excluded. Auth: session or API key with `analytics:read` / `links:read`. UI: `/manage/lifespan`.

## CSV export

Add `&format=csv` to `GET /api/analytics/lifespan` to download the per-link rows as `link-lifespan.csv` (scalar columns only).
