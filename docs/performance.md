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
