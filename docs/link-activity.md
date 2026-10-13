# Link activity timeline

`GET /api/links/:code/activity?limit=25&cursor=…&action=link.update`

Newest-first audit history for one link: action, actor type, timestamp and a
field-level diff of before/after snapshots. Keys that look secret
(password, token, hash, secret, signature…) are masked as `[redacted]`; IP
hashes and user agents are never returned. Works for trashed links.

- Auth: API key with `links:read`, any workspace role, or the link's management token.
- Pagination: opaque keyset cursor over `(createdAt, id)`, stable when many events share a timestamp. `limit` 1–100 (default 25).
- Rate limit: 60 requests/minute.
- UI: "Activity" button on each link card in the account page.
