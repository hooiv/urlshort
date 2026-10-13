# Rename a short code

`POST /api/links/:code/rename` with `{ "newShortCode": "spring-sale", "confirm": true }`.

- Auth: `links:write` API key, an editor role, or the link's management token.
- The old short URL stops resolving immediately (no alias is kept), so `confirm: true` is mandatory.
- 400 invalid/reserved/unchanged code or missing confirm, 409 code taken, 429 rate limited (30/min).
- Clicks, rules, tags and analytics stay attached to the link. Redirect caches for both codes are evicted, and a `link.rename` audit entry records before/after.
