# Click-ID passthrough

Set `clickIdParam` on a link (PATCH `/api/links/:code` or `POST /api/shorten`) and every human redirect
appends `?<param>=<clickEventId>` to the destination. The id equals the ClickEvent id, so a postback from an
ad/affiliate network can be joined to the click. Replaces any existing value of that param; bots get the canonical URL.

- Name: starts with a letter, `[A-Za-z0-9_]`, max 32 chars. Reserved: `token`, `code`, `state`, `password`, `redirect`, `redirect_uri`, `callback`, `signature`, `access_token`, `ql_attribution`.
- `null`/empty disables. Manage UI: link page → Expiration section.
- Cached in the redirect link cache (`clickIdParam`); PATCH invalidates it like any link edit.
