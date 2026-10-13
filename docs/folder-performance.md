# Folder performance

`GET /api/analytics/folders?workspaceId=&days=7|30|90` returns human clicks per folder (plus an "Unfiled" row with `folderId: null`) versus the preceding window of equal length: `links`, `clicks`, `previousClicks`, `changePct` (null when no prior traffic), `sharePct`.

- Auth: session or API key with `analytics:read` / `links:read`; workspace membership required.
- Members who cannot administer folders only see open folders, folders they were granted, and links they own.
- UI: `/manage/folder-performance`.
