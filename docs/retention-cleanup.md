# Retention cleanup

The privacy cron (`/api/cron/privacy`) enforces each workspace's `retentionDays` (click events) and `auditRetentionDays` (audit events).

- Deletes run in batches of 5,000 rows (max 40 batches per workspace per run) using a `JOIN urls` subselect, so no link-id list is loaded into memory and no single statement holds long locks.
- The response includes `cleanup.exhausted: true` when the batch budget ran out; the next cron run continues where it stopped.
- Other workspaces' rows are never touched (covered by a real-Postgres test).
