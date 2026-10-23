# Paused links report

`GET /api/links/paused?workspaceId=&limit=50&minAgeDays=0` lists inactive, non-trashed links, longest-paused first, with lifetime clicks and days paused (based on last update). Auth: session or API key with `analytics:read` / `links:read`. `limit` 1-200, `minAgeDays` 0-3650. Workspace viewers only see their own links unless they can administer folders.
