# Scheduled destination swaps

Send a link to destination A until a time, then to B, then C — no cron job involved.

`PATCH /api/links/:code` with `{"destinationSchedule":[{"at":"2026-11-27T00:00:00+05:30","url":"https://shop.example/black-friday"},{"at":"2026-11-30T00:00:00+05:30","url":"https://shop.example/cyber-monday"}]}`.
Send `null` or `[]` to clear. Requires the `links:write` scope for API keys.

- Resolved at click time: the latest step whose `at` has passed wins; before the first step the link's normal destination is used.
- Precedence: smart-routing rule > running campaign > scheduled swap > latest revision > original URL.
- Max 20 steps, unique instants, each URL passes the same safety checks as a normal destination. Stored sorted, in UTC.
- Redirects with a schedule use a temporary status (never cached as permanent), like other time-gated links.
- Served identically by the Node route and the edge route (config carries `destinationSchedule`).
- UI: Manage → link → "Scheduled Destination Swaps".
