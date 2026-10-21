# Link preview

Public, click-free page showing where a short link goes: `/preview/:shortCode`, JSON at `GET /api/preview/:shortCode` (rate limited 60/min/IP, `noindex`).

- Never records a click.
- Status: live, scheduled, expired, disabled, limit_reached.
- Password-protected and cloaked links reveal at most the host; trashed links return 404.
- Destination safety assessment is included.
- Link cards in the dashboard have a "Copy preview link" action.
