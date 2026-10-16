# Analytics performance

## Breakdown rollups (`click_dimension_daily`)

The country / device / referrer cards on `/analytics` and `GET /api/analytics` used to
`GROUP BY` over raw `click_events` joined to `urls`. That cost grows with click volume.
Breakdowns now read `click_dimension_daily`: one row per link x UTC day x dimension x value,
incremented in the same transaction that inserts the click events (`src/lib/queue.ts` ->
`applyDimensionRollups`). Only `trafficType = 'human'` clicks are counted, as before. Missing
values bucket as `unknown`. Rollup rows outlive the 180-day raw-event retention sweep.

Migration `20261015_click_dimension_daily` creates the table and backfills it from retained raw
clicks. Rollup writes are one `INSERT ... SELECT unnest(...) ON CONFLICT DO UPDATE` per batch,
sorted by key so concurrent workers do not deadlock.

### Timings (embedded Postgres 17 on a 2-vCPU sandbox, 500 links, 200k clicks over 60 days, 30-day window, country breakdown)

| | Before (raw `click_events`) | After (rollup) |
|---|---|---|
| Execution time | 143-154 ms (index scan of ~100k rows) | 26-28 ms |

The "before" cost scales linearly with clicks; the "after" cost scales with links x days x distinct values.

Reproduce: `DATABASE_URL=... node scripts/perf-profile.mjs 200000` seeds a `perf-ws` workspace and prints
EXPLAIN ANALYZE plans for the raw-scan form of the query.

Backlog: totals/time series already read `click_daily`; the remaining raw scans are per-link detail views.

## Best-time heatmap

`GET /api/analytics/:shortCode/heatmap?tz=<IANA zone>&days=1..90` returns human clicks bucketed by weekday (0 = Sunday) and hour in the requested timezone: a dense 7×24 `grid`, `total`, `peak` and the `topSlots` (up to three). Bucketing runs in Postgres (`AT TIME ZONE`) over the `(urlId, createdAt)` index so only ≤168 rows leave the database; bots are excluded. Auth: session or API key with `analytics:read`/`links:read`. Invalid `tz` or `days` return 400. Shown on the link analytics page as "Best time to post".
- Added ?format=csv on /api/analytics/{tags,folders,cities,referrers,countries}
