# Period comparison

`GET /api/analytics/:shortCode/compare?days=30`

Human clicks (bots excluded) in the last `days` (1-180) versus the `days` immediately before, plus a
day-aligned `series` (`day` 1..N, `current`, `previous`) for overlay charts. `changePercent` is rounded to
one decimal and is `null` when the previous period had no clicks (growth undefined).

Windows are rolling and contiguous (`previous.to === current.from`). One grouped query on the
`(urlId, createdAt)` index covers both. Auth: session or API key with `analytics:read` / `links:read`.
Rate limit 60/min. Shown on the link analytics page as "Compared to previous period".
