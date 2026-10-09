# Stripe sale attribution

Credit every paid Stripe checkout, and optionally every subscription renewal, to
the short link click that drove it. No client-side conversion call is needed.

## Setup

1. **Manage → Revenue** (`/manage/integrations`): create an integration and copy its endpoint URL.
2. Stripe Dashboard → Developers → Webhooks → *Add endpoint*: paste the URL and select
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`,
   `charge.refunded`.
3. Paste the endpoint's signing secret (`whsec_…`) into the integration. It activates immediately.
4. Pass the attribution token into Checkout:

```js
// Browser: QuickLink appends the token to the destination URL fragment.
const token = new URLSearchParams(location.hash.slice(1)).get('ql_attribution')

// Server
await stripe.checkout.sessions.create({ /* … */ metadata: { ql_attribution: token } })
```

For subscriptions created without Checkout, put the token in `subscription_data.metadata`
(or the subscription's metadata). `quicklink_attribution` is accepted as an alias.

## What gets recorded

* A `ConversionEvent` on goal `purchase` (configurable via `goalEventKey`), auto-created per
  link on first sale, with `valueCents` = `amount_total` / `amount_paid` and the ISO currency.
  A goal the user disabled is respected, never silently re-enabled.
* Daily aggregates (`ConversionDaily`), workspace `conversions` quota, and a
  `conversion.recorded` webhook with `source: "stripe"`.
* The first link to acquire a Stripe customer owns their renewals (first-touch). A later
  checkout through another link is credited to that link, but does not move renewals.

## Guarantees

| Concern | Behaviour |
| --- | --- |
| Authenticity | `Stripe-Signature` HMAC-SHA256 over `t.body`, constant-time compare, multiple `v1` (secret rolling), 300 s replay window. |
| Idempotency | Each Stripe event id and each sale (`checkout:<id>`, `invoice:<id>`) is a unique receipt written in the same transaction as the conversion. Retries and concurrent duplicates never double count. |
| Subscription first invoice | A subscription Checkout claims its first invoice, so the matching `invoice.paid` is skipped (`covered_by_checkout`), in either delivery order. |
| Cross-tenant abuse | Tokens are portable, so a sale is only credited to links the integration owner owns or is a workspace member of (`foreign_link` otherwise). |
| Privacy | Visitor ids follow the workspace privacy policy (hashed per workspace, dropped in aggregate-only mode). |
| Quota | Over quota returns 503 + `Retry-After` and writes no receipt, so Stripe's retries (up to 3 days) land the sale once quota frees up. |
| Ignored events | Acknowledged with 200 so Stripe doesn't retry or disable the endpoint. |

Each response carries `outcome` (`recorded`, `duplicate`, `no_attribution`, `invalid_token`,
`foreign_link`, `unpaid`, `zero_amount`, `goal_disabled`, `recurring_disabled`,
`covered_by_checkout`, `ignored_event`, `quota_exceeded`, `refunded`), visible in Stripe's delivery log.

## Refunds

`charge.refunded` reverses revenue on the conversion its payment intent created, on the
day the sale was earned. Stripe reports a cumulative `amount_refunded`; QuickLink stores how
much it has already reversed and applies only the difference, so partial refunds, repeat
refunds and redeliveries converge on the correct net value. The conversion stays counted.
A `conversion.refunded` webhook (`refundedCents`, `netValueCents`) is emitted.

Limitation: refunds of subscription renewals are matched only on Stripe API versions whose
invoices still carry `payment_intent`.
