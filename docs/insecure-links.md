# Insecure destinations report

`GET /api/links/insecure?workspaceId=&limit=50` lists active links whose destination is plain `http://`, most-clicked first, each with a ready `httpsUrl` suggestion, plus `total`, `insecure` and `sharePercent`. Auth: session or API key with `analytics:read` / `links:read`. Rate limit 60/min. Fix in bulk by editing destinations to the suggested `httpsUrl`.
