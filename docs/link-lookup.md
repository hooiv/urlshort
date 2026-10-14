# Link lookup by destination

`GET /api/links/lookup?url=<destination>[&workspaceId=<id>]`

Returns existing links whose destination matches the URL after normalisation (case-insensitive host, `www.`, default ports, fragment, trailing slash, query order, tracking params such as `utm_*`/`fbclid`/`gclid`). Use it before creating a link to avoid duplicates.

```json
{ "found": true, "truncated": false, "matches": [{ "shortCode": "abc", "originalUrl": "https://example.com/a", "clicks": 12, "isActive": true, "exact": true }] }
```

- Ranking: byte-identical stored URL first, then active, then most clicks, then oldest. Max 20 matches.
- Scope: your personal links, or a workspace (members see all links if admin, otherwise their own). Trashed links are excluded.
- Auth: session or API key with `links:read` / `analytics:read`. Rate limit 120/min.
- Candidates are narrowed in SQL by host (up to 500 rows); `truncated: true` means the host has more links than were compared.
