# Click milestone alerts

Opt-in email (Account > Notifications, or `PATCH /api/account/notifications {"milestoneAlerts": true}`; verified email required) sent when a link first reaches 100, 1k, 10k, 100k or 1M clicks.

- Cron: `GET /api/cron/click-milestones` hourly (`CRON_SECRET` required), batches one email per owner.
- Idempotent: `urls.milestoneReached` is claimed with a compare-and-set before sending; a failed send restores the previous value so the next run retries.
- Migration `20261019_click_milestones` backfills existing links so nobody is told about milestones passed long ago.
