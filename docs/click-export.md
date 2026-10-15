# Raw click export

`GET /api/analytics/:shortCode/clicks?format=csv|ndjson&from=YYYY-MM-DD&to=YYYY-MM-DD`

Streams individual click events for one link, oldest first. Auth: session, or an API key with `analytics:read` / `links:read`. Viewer role or higher.

- Default window: last 30 days. Max range 366 days. Max 100,000 rows per request (narrow the range to continue).
- Columns: id, timestamp (ISO UTC), country, city, device, os, browser, language, traffic_type, referrer_host, utm_source/medium/campaign/term/content.
- IP addresses and user agents are never exported.
- CSV cells starting with `= + - @` are prefixed with `'` to block spreadsheet formula injection.
- Rows are read with keyset pagination on `(createdAt, id)` using the `(urlId, createdAt)` index, 1,000 per page, so memory stays flat.
- Rate limit 6/min per caller; every export is written to the audit log as `clicks.export`.
