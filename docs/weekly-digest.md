# Weekly performance digest

Opt-in email (Account → Notifications, `GET/PATCH /api/account/notifications`, session auth only, requires a verified email).

- Cron: `/api/cron/weekly-digest`, Mondays 08:00 UTC, `CRON_SECRET`-protected like the other crons.
- Content: last 7 complete UTC days vs the 7 before: clicks, conversions, revenue per currency, top 5 links, top country and referrer (human traffic). Reuses `getAggregatedAnalytics`, so it reads daily rollups, not click events.
- Idempotent: each user is claimed with a compare-and-set on `weeklyDigestSentAt` (min interval 6.5 days). Overlapping cron runs cannot double-send; a failed send releases the claim so the next run retries.
- Users with no clicks in either week get nothing.
- Toggling is audit-logged (`account.weekly_digest.enable|disable`).
