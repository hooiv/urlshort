# Scheduled (not yet live) links

`GET /api/links/scheduled?workspaceId=&limit=50` lists workspace links whose `startsAt` is still in the future, soonest first (`limit` 1–200, `workspaceId` required). Returns `links` (`id`, `shortCode`, `title`, `originalUrl`, `clicks`, `startsAt`) and `total`. Session auth or an API key with `analytics:read` / `links:read`; non-admin members only see links they may read. Trashed links are excluded. UI: `/manage/scheduled?workspaceId=…` can launch selected links now (clears `startsAt` through `PATCH /api/bulk/edit`, audited).
