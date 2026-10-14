# Insecure destination audit

`GET /api/analytics/insecure?workspaceId=&limit=50` lists active links whose destination is plain `http://`, busiest first, with an `https://` suggestion. Local and private-network hosts are skipped. Auth: session or API key with analytics:read / links:read. Apply fixes with `PATCH /api/links/:code`.
