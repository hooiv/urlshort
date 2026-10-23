# Never-clicked links

`GET /api/links/never-clicked?workspaceId=&limit=50&minAgeDays=7` lists active links with zero clicks that are at least `minAgeDays` old (0–3650), oldest first, plus the total match count. `limit` is 1–200. Session auth or an API key with `analytics:read` / `links:read`; workspace viewers only see links they may read. UI: `/manage/never-clicked`, which archives selected links through `PATCH /api/bulk/edit` (audited).
