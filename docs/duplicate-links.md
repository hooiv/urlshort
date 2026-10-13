# Duplicate destinations

`GET /api/links/duplicates?workspaceId=&limit=25` (session or API key with `analytics:read`/`links:read`) returns groups of active links that point at the same page, after normalising scheme, `www.`, default ports, fragments, trailing slashes, query order and tracking params (utm_*, fbclid, gclid, ...). Each group has `keep`, the most-clicked link (oldest on ties), as the suggested survivor. Scans at most 20,000 links; `truncated` flags a larger scope. Workspace members who are not admins only see their own links.
