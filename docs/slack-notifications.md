# Slack notifications

Add a Slack **incoming webhook** URL (`https://hooks.slack.com/services/T…/B…/…`) as a normal webhook endpoint
(`POST /api/webhooks`, personal or workspace-owned, same scopes and link filters). No OAuth app is needed.

Endpoints on `hooks.slack.com` are delivered as Block Kit messages instead of the signed JSON envelope, and no
`X-QuickLink-*` headers are sent. Retries, delivery log, auto-disable and quotas are shared with every webhook.

Supported events: `link.created`, `link.updated`, `link.clicked`, `conversion.recorded` (sale),
`conversion.refunded`, `diagnostic.test`. `GET /api/webhooks` returns `format: "slack" | "json"`.
User-controlled text is escaped so a destination URL cannot trigger `@channel` mentions. Malformed
`hooks.slack.com` URLs are rejected at creation.
