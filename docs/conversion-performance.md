# Conversion performance

`GET /api/analytics/conversions?workspaceId=&days=7|30|90` returns, per link with conversions, `clicks` (human), `conversions`, `previousConversions`, `conversionRatePct` (capped at 100, null with no clicks), `changePct` (null without prior conversions) and `revenue` (cents summed per currency, never mixed across currencies).

- Auth: session or API key with `analytics:read` / `links:read`; workspace membership required.
- Viewers who cannot administer folders only see links they may access. Capped at 250 links, ordered by conversions.
- UI: `/manage/conversions`.
