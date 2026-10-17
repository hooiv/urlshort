# Webhook secret rotation

`POST /api/webhooks/:id/rotate-secret` (webhook scope; owner or workspace admin) with optional `{ "graceHours": 0-168 }` (default 24).

- Returns the new `secret` once. Stored secrets are never returned again.
- During the grace window `X-QuickLink-Signature-256` carries two `v1=` entries (new, then old): `t=<ts>,v1=<new>,v1=<old>`. Verifiers that accept any matching `v1` (the documented algorithm) keep working with either secret, so rollout needs no downtime.
- `graceHours: 0` revokes the old secret immediately.
- The legacy `X-QuickLink-Signature` header uses the new secret only.
- Concurrent rotations are compare-and-set; the loser gets `409`.
- Audited as `webhook.secret_rotated`. Rate limit: 10/min.
