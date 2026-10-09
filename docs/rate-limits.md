# API rate limits

Every limited endpoint answers with:

| Header | Meaning |
| --- | --- |
| `RateLimit-Limit` / `X-RateLimit-Limit` | Requests allowed per window |
| `RateLimit-Remaining` / `X-RateLimit-Remaining` | Requests left in the current window |
| `RateLimit-Reset` / `X-RateLimit-Reset` | Seconds until capacity starts freeing |
| `Retry-After` | On `429` only: seconds to wait before retrying |

Windows are sliding. Current budgets: `POST /api/shorten` 20/min, `GET /api/analytics` 60/min.
Headers are sent on `429` responses for shorten, analytics (aggregate and per-link) and link export.
When Redis is configured the budget is shared across instances; if Redis is down the limiter
falls back to per-instance counting rather than rejecting traffic.
