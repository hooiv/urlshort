# Webhook event contract
Every event is an envelope: `id`, `type`, `version`, `createdAt`, and `data`.
Stable types: `link.clicked` v1, `conversion.created` v1, `campaign.updated` v1, `campaign.decision` v1, `destination.anomaly` v1. Consumers must use `type` + `version`, ignore unknown fields, and deduplicate by envelope `id`. Delivery is at-least-once. Signatures are HMAC-SHA256 over the exact request body.
## Verifying deliveries (replay-safe)

Every delivery carries:

| Header | Value |
|---|---|
| `X-QuickLink-Signature` | Legacy: hex HMAC-SHA256 of the raw body. Kept for existing consumers. |
| `X-QuickLink-Signature-256` | `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">` |
| `X-QuickLink-Timestamp` | The same `t`, for logging. |
| `X-QuickLink-Delivery` | Delivery id — deduplicate on it (delivery is at-least-once). |

Verify `X-QuickLink-Signature-256` and reject anything whose `t` is more than 300 seconds from your clock. The legacy header can be replayed indefinitely by anyone who captures one request; the timestamped one cannot.

```ts
import crypto from 'node:crypto'
function verify(rawBody: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return parts.v1?.length === 64 && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected))
}
```

## Choosing which links fire an endpoint

`POST /api/webhooks` and `PATCH /api/webhooks/:id` accept a link filter:

```json
{ "url": "https://example.com/hooks", "events": ["link.clicked"], "linkScope": "tags", "tags": ["launch", "newsletter"] }
```

- `linkScope: "all"` (default) — every link you own.
- `linkScope: "tags"` + `tags` — links carrying at least one of the tags (case-insensitive, max 50).
- `linkScope: "links"` + `shortCodes` — exactly those links (max 500; every code must be yours or the request is rejected).

On `PATCH`, send `linkScope` together with its list; the filter is replaced as a whole.
