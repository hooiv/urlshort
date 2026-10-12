# Expiring links

`GET /api/links/expiring?days=7` (1-90) lists links that expire within the window or are at least 80% through their click cap. Session or API key (`links:read`/`links:write`).

UI: `/manage/expiring` (also in the command palette) with a horizon selector and urgency colouring (critical < 24h or <= 10 clicks left).
