# Usage alerts

Hourly cron `/api/cron/usage-alerts` (CRON_SECRET auth) emails workspace owners and admins when monthly clicks, API requests, conversions or webhook deliveries first reach 80% and again 100% of the workspace quota. Dedupe is the unique `usage_alerts(workspaceId, metric, periodKey, threshold)` row, claimed before sending, so overlapping runs never double-send. Alerts reset each calendar month (UTC).
