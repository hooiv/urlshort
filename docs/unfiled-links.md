# Links not in any folder

`GET /api/links/unfiled?workspaceId=&limit=50` lists workspace links with no folder, most clicked first (`limit` 1–200, `workspaceId` required). Returns `links` (`id`, `shortCode`, `title`, `originalUrl`, `clicks`) and `total`. Session auth or an API key with `analytics:read` / `links:read`; non-admin members only see links they may read. Trashed links are excluded. UI: `/manage/unfiled?workspaceId=…` picks a destination folder and moves the selection through `PATCH /api/bulk/edit` (audited, folder write rights enforced).
