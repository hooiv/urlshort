# UTM coverage

`GET /api/analytics/utm-coverage?workspaceId=&limit=50` (session or API key with `analytics:read`/`links:read`) audits active links for missing `utm_source`, `utm_medium` or `utm_campaign` on the destination URL (empty values count as missing). Returns `totalLinks`, `tagged`, `coveragePercent`, and `links` with a `missing` list; `truncated` means more than `limit` (max 200) have gaps. Non-admin workspace members only see their own links.

UI: `/manage/utm-coverage` shows the coverage percentage and lets you apply UTM values to selected links through `/api/bulk/edit` (transactional, audit-logged).
