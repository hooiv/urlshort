# Redirect cache and invalidation

Every redirect reads its link, rules and current revision through an
in-process cache (`src/lib/link-cache.ts`). This page covers when entries are
evicted and how instances stay coherent.

## What gets evicted

| Mutation | Call | Evicts |
| --- | --- | --- |
| Edit/delete link, rules, revisions, promote | `invalidateLink(code, id)` | short code, every custom-domain path resolved to the link, revision |
| Safety status change (block/clear) | `invalidateLink` | same |
| Rule health transition (healthy ↔ down) | `invalidateLink` | same |
| Link created (`/api/shorten`, bulk import) | `invalidateLink` / `invalidateLinks` | negative entry for a code probed before it existed |
| Expiry sweep, account deletion | `invalidateLinks(rows)` | all affected links |
| Domain path added/removed, domain verified | `invalidateDomain(host)` | every path cached for the host, including "not found" entries |

Scheduled revisions need no call: a revision entry never outlives the next
revision's `effectiveAt`.

A load that was in flight when an invalidation ran returns its result to the
readers already waiting on it but is never written to the cache.

## Across instances

With `REDIS_URL` set, each invalidation is also published on
`ql:link-cache:invalidate:v1` and applied by every instance (messages are
capped at 500 keys; bulk operations send several). Each instance holds one
extra Redis connection for the subscription.

| Bus state | Entry TTL | Staleness on other instances |
| --- | --- | --- |
| Subscribed | `QL_LINK_CACHE_BUS_TTL_MS` (default 60 s, +≤30% jitter) | one Redis round trip |
| No Redis / subscription down | `QL_LINK_CACHE_TTL_MS` (default 5 s, +≤30% jitter) | one TTL |

When the subscription drops or reconnects the instance flushes its cache,
since it cannot know which messages it missed. A failed publish never fails
the mutation; it is counted and the TTL remains the bound.

`QL_LINK_CACHE_MAX_ENTRIES` (default 10 000) bounds memory per instance.

## Observing it

`GET /api/status/metrics` (signed in) includes `linkCache`: hits, misses,
coalesced reads, stale loads discarded, local/remote invalidations, flushes,
size, the active TTL and bus counters (`connected`, `published`, `received`,
`publishFailures`). A rising `publishFailures` with `connected: false` means
instances are falling back to the short TTL.
