# Link hygiene summary

`GET /api/links/hygiene[?workspaceId=]` returns one aggregate row of counts: `total`, `active`, `archived`, `destinationDown`, `destinationDegraded`, `expired`, `expiringSoon` (next 7 days), `scheduled`, `clickLimitReached`, `flaggedRisky` (riskStatus not `cleared`), `untagged`, `passwordProtected`.

Trashed links are excluded. Auth: session or API key with `analytics:read` / `links:read`. Workspace members without admin rights only count their own links. Single indexed-scope SQL query using FILTER aggregates, rate limited to 60/min.
