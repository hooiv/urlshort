# Rewards and commissions

QuickLink turns Stripe sales into commissions you can approve, pay and export.

## How a commission is created

1. A sale is attributed to a link (see `stripe-attribution.md`).
2. In the **same database transaction** as the conversion, the reward rules are resolved:
   the link's own scope first, then your account default (`resolveReward` in `src/lib/reward-rules.ts`).
   The first scope that matches a rule or defines a default decides; a scope that matches nothing
   falls through to the next.
3. Rules match on Stripe metadata (`checkout.session.metadata`, or invoice / subscription
   metadata for renewals). Example: `plan = pro` pays 20%, everything else pays the 10% default.
4. One `Commission` row is written per conversion (`conversionId` is unique), so webhook
   redeliveries can never pay twice. No matching reward or a zero result writes nothing.

Amounts are integer cents. Percentages are basis points (1000 = 10%). A commission never
exceeds the sale value and honours the rule's `capCents`.

## Lifecycle

`pending` → `approved` → `paid`, or `reversed`.

- New commissions are `pending` with a 30-day refund window (`holdUntil`).
- **Refunds** shrink an unpaid commission proportionally (floor, never overpays). A full refund
  reverses it. If it was already `paid`, the amount stays and `clawbackCents` records what to
  recover from the next payout. Stripe reports cumulative refunds, so repeats are idempotent.
- Status changes are single guarded `UPDATE`s keyed on the source status and owner: a double
  click or two admins racing change nothing twice.

## API

All routes accept a session or an API key. Reads need `links:read` (or `links:write`); writes need `links:write`.

| Route | Purpose |
| --- | --- |
| `GET /api/rewards/config` | Account default plus per-link overrides |
| `PUT /api/rewards/config` | Replace one scope: `{ shortCode? \| urlId?, rules, fallback }`. Omit the link for the account default |
| `DELETE /api/rewards/config?urlId=` | Clear a scope (existing commissions are untouched) |
| `POST /api/rewards/preview` | Dry run of rules against sample sales |
| `GET /api/commissions?status=&urlId=&cursor=` | Paged list (50) with per-status totals |
| `POST /api/commissions` | `{ action: approve\|pay\|reverse, ids \| allDue, payoutRef? }` |
| `GET /api/commissions/export?status=approved` | Payout CSV |
| `GET /api/commissions/statement?month=YYYY-MM` | Per-currency monthly statement: pending/approved/paid/reversed, clawbacks, net payable (approved − clawbacks, floored at 0) |

The CSV defuses spreadsheet formulas (`=`, `+`, `-`, `@` prefixes are quoted) and includes
`net_payable` (commission minus clawback).

## UI

`/manage/rewards`: edit the account default or a link's rules, preview a sample sale, review
commissions by status, approve everything past its refund window, mark payouts with a reference,
and download the payout CSV.

## Limits

- Rewards are owner-scoped: the Stripe integration's owner earns the ledger entries.
  Partner/affiliate identities are not modelled yet.
- Rules are stored per scope as validated JSON (max 25 rules per scope).
