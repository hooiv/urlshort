# Bulk QR download

`POST /api/links/qr-zip` (session or API key with `links:read`/`links:write`)

Body: `{ "codes": ["a","b"], "format": "png"|"svg", "track": true, "size", "margin", "dark", "dark2", "light", "level", "dots", "eyes", "eyeColor", "transparent", "logo", "logoScale", "caption" }`

Returns `application/zip` with one `<code>.<format>` per readable link (max 100 codes). Links you cannot read are skipped and listed in `X-QR-Skipped`; `X-QR-Count` holds the number included. The archive is store-only (PNG/SVG are already compact), written by `src/lib/zip-store.ts`; member names are sanitised and de-duplicated.
