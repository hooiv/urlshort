# Link cloning

`POST /api/links/:code/clone` with optional `{ "shortCode": "my-copy" }` copies a link to a new short code (random 7 chars if omitted; 5 retries on collision, `409` when a requested code is taken).

Copied: destination, title/description/OG image, expiry and go-live schedule, click cap, pixels, cloaking, folder, workspace, deep-link app, tags, failover setting and all routing rules (geo/device/language/referrer/weight/time windows).

Not copied: click counters, health state, password, management token, public-stats sharing, webhook URL, milestones. A clone starts clean and never inherits secrets.

Auth: session with an edit role, API key with `links:write`, or the link's management token. Rate limited to 30/min. Writes a `link.clone` audit entry. Link and rules are created in one transaction.
