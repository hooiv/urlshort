# Link scheduling (go-live window)

A link can carry `startsAt` in addition to `expiresAt`. Outside the window the redirect returns a 307 and records no click.

- Before `startsAt`: redirect to `notStartedUrl` if set, otherwise the hosted `/coming-soon` page.
- After `expiresAt`: existing behaviour (`expiredUrl` or `/expired`).
- Both ends are inclusive. `startsAt` must be earlier than `expiresAt` (400 otherwise).

API: `POST /api/shorten` and `PATCH /api/links/:code` accept `startsAt` (ISO 8601 or null) and `notStartedUrl` (HTTP/S URL or null; passes the same SSRF/safety check as `expiredUrl`). `GET /api/links/:code` returns both. PATCH requires the same scope as other link edits; cache is invalidated by the existing update path.

UI: Manage → Access Protection & Expiration → Go-live Date & Time / Pre-launch Destination.

Not covered: the edge-runtime redirect (`/edge/:code`) does not yet read `startsAt`.

## Owner email digest

`/api/cron/expiry-digest` (daily 09:00 UTC, CRON_SECRET-protected) emails each owner the links expiring in ~7 days and ~1 day. Each link falls in one 24h window per threshold, so daily runs never repeat a link.
