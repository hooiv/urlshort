# QuickLink — Smart link infrastructure

One permanent short link, many destinations. QuickLink routes visitors by country, device, referrer, or time window; runs deterministic weighted experiments; tracks conversions back to the exact click and routing rule; and fails over automatically when a destination goes down.

## Features

- **Smart routing** — per-link rules filtered by country, device type, referrer, and time window. Equal-priority rules run deterministic weighted experiments (sticky per visitor via SHA-256 bucketing).
- **Destination releases** — append-only revision history with scheduled (`effectiveAt`) releases and one-click rollback.
- **Conversion tracking** — HMAC-signed attribution tokens travel in the URL fragment (never sent to destination servers); the `/quicklink.js` snippet persists them and reports goals (`QuickLink.track()`), attributed to the originating click and rule.
- **Analytics** — date-range click/conversion analytics with geo, device, referrer breakdowns, per-rule experiment performance, and CSV export.
- **Health monitoring & auto-failover** — SSRF-hardened destination probes (DNS-resolved private-IP blocking, redirect re-validation), circuit-breaker thresholds, cron sweep endpoint, and on-demand checks.
- **Branded domains** — customer-owned hostnames with DNS TXT verification and path-mapped links.
- **Workspaces** — 5 roles (owner/admin/editor/analyst/viewer), email-bound expiring invites, per-role permissions.
- **API keys** — programmatic access via `x-api-key` (hashed at rest, revocable, shown once).
- **QR codes** — per-link PNG/SVG generation with configurable size and colors.
- **Trust & safety** — heuristic risk scoring at creation, public abuse reporting, operator safety console, blocked/expired interstitials.
- **Audit log** — every auth and management action recorded with hashed IPs.
- **Adaptive campaign control plane** — attach a statistically guarded experiment to a permanent short link, run an auditable Autopilot that shifts allocation only after evidence thresholds, and surface anomaly/decision history in one control center.

## Tech stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Prisma ORM · PostgreSQL (Neon-ready, pooled + direct connections)
- Tailwind CSS · lucide-react · react-hot-toast
- bcryptjs sessions (opaque tokens, SHA-256 at rest) · nanoid · qrcode

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL + QL_ATTRIBUTION_SECRET
pnpm db:push           # sync schema to your database
pnpm dev               # http://localhost:3000
```

Required environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (pooled endpoint in production) |
| `DIRECT_DATABASE_URL` | Direct connection for migrations |
| `QL_ATTRIBUTION_SECRET` | ≥32-char HMAC secret for attribution tokens (required, validated at startup) |
| `NEXT_PUBLIC_BASE_URL` | Public base URL used to build short URLs |
| `HEALTH_SWEEP_SECRET` | Shared secret for the `POST /api/health/sweep` cron endpoint |
| `TRACK_ALLOWED_ORIGINS` | Optional comma-separated origin allowlist for `/api/track` (default `*`) |
| `EMAIL_PROVIDER` | `console` (default) or `resend` |
| `RESEND_API_KEY` / `EMAIL_FROM` | Required when `EMAIL_PROVIDER=resend` |
| `EVENT_RETENTION_DAYS` | Raw event retention for the maintenance sweep (default 180) |
| `CRON_SECRET` | Vercel Cron bearer token (set equal to `HEALTH_SWEEP_SECRET`) |

## API overview

All management endpoints accept a session cookie, a per-link management token (`x-management-token` or `Authorization: Bearer`), or an API key (`x-api-key`).

| Endpoint | Description |
|---|---|
| `POST /api/shorten` | Create a link (custom code, title, workspace). Rate-limited. |
| `GET /api/shorten` | List links — `?search=&cursor=&take=` keyset pagination. |
| `GET/PATCH/DELETE /api/links/[shortCode]` | Link detail, edit (title/active/expiry/destination), soft-delete. |
| `GET /api/analytics/[shortCode]` | Analytics — `?range=24h\|7d\|30d\|90d\|all` or `?from=&to=`. |
| `GET /api/links/[shortCode]/export` | Click events as CSV (date-filterable, 10k row cap). |
| `GET /api/links/[shortCode]/qr` | QR code — `?format=png\|svg&size=&margin=&dark=&light=`. |
| `POST /api/links/[shortCode]/revisions` | Publish/schedule a destination release. |
| `POST /api/links/[shortCode]/rules` | Create a smart-routing rule. |
| `GET/PATCH/DELETE /api/links/[shortCode]/goals` | Conversion goal management. |
| `GET/POST /api/links/[shortCode]/health` | Health snapshot / on-demand probe (rate-limited). |
| `GET/PATCH /api/links/[shortCode]/safety` | Risk status + abuse reports. |
| `GET/POST/DELETE /api/account/api-keys` | API key management. |
| `POST /api/track` | Public conversion endpoint (HMAC token, CORS allowlist, 24h dedup). |
| `POST /api/health/sweep` | Cron: probe the 50 stalest links (`x-health-sweep-secret` header). |
| `POST /api/abuse/report` | Public abuse reporting. |
| `POST /api/auth/reset` + `/confirm` | Password reset request / token confirmation. |
| `POST /api/auth/verify` + `/confirm` | Email verification send / confirm. |
| `POST /api/account/password` | Change password (revokes other sessions). |
| `GET/POST/DELETE /api/account/api-keys` | API key management. |
| `GET/PATCH/DELETE /api/workspaces/[id]/members` | List, role changes, remove/leave. |
| `GET/POST/DELETE /api/workspaces/[id]/invites` | List, create, revoke invites. |
| `POST /api/maintenance/sweep` | Cron: retention cleanup of expired rows. |

### Cron scheduling

`vercel.json` pre-configures both sweeps for Vercel Cron (health every 10 min, retention every 3 h). Vercel sends `Authorization: Bearer $CRON_SECRET` — set `CRON_SECRET` equal to `HEALTH_SWEEP_SECRET`. For other platforms, call the endpoints with POST and the `x-health-sweep-secret` header.

### Conversion tracking snippet

```html
<script src="https://your-domain/quicklink.js" async></script>
<script>
  window.QuickLink?.track('purchase_completed', { valueCents: 4900, currency: 'USD' })
</script>
```

## Security model

- **No raw IPs stored** — visitor IDs and audit IPs are hashed.
- **Tokens in URL fragments** — management and attribution tokens never reach destination servers.
- **SSRF defense** — destinations are DNS-resolved and checked against private/loopback/link-local ranges at creation, on every rule/revision change, and on every health-probe hop.
- **Timing-safe** comparisons for all token/secret verification.
- **Rate limiting** on creation, auth, tracking, analytics, QR, exports, and probes.
- **Security headers** — CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy.

## Deployment notes

- Use Neon (or any serverless Postgres) with the **pooled** connection string in `DATABASE_URL`.
- The in-process rate limiter and link cache are per-instance; for multi-instance deployments back the limiter with Redis (swap the `RateLimiterBackend` in `src/lib/rate-limit.ts`).
- Schedule `POST /api/health/sweep` every 5–15 minutes with the `x-health-sweep-secret` header.
- Rotate `QL_ATTRIBUTION_SECRET` carefully — it invalidates outstanding attribution tokens.

<!-- Legacy documentation below -->

## ✨ Features
