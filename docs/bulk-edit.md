# Bulk edit

`PATCH /api/bulk/edit` changes up to 500 links at once. Needs a session or an API key with `links:write`. Rate limit: 20 requests/minute per user.

```json
{
  "links": ["promo", "clx9abc…"],
  "changes": {
    "addTags": ["q4"], "removeTags": ["draft"],
    "folderId": "fld_…",
    "expiresAt": "2026-12-31T23:59:59Z",
    "archived": true,
    "utm": { "source": "newsletter", "medium": "email" }
  }
}
```

`links` takes ids or short codes. `changes` keys:

| key | effect |
| --- | --- |
| `addTags` / `removeTags` | lowercased, deduped; max 20 tags per link |
| `setTags` | replace all tags (not combinable with add/remove) |
| `folderId` | move into a folder; `null` removes from folder. All links must be in one workspace and you need editor rights on the folder |
| `startsAt` | ISO datetime go-live time, or `null` to clear; must be before the effective `expiresAt` per link |
| `expiresAt` | future ISO datetime, or `null` to clear |
| `expiredUrl` | http(s) fallback URL for expired or click-capped links, or `null` to clear it |
| `geoFence` | `{ mode: "allow"\|"deny", countries: ["US"] }` applied to every link, or `null` to remove the restriction (also in the bulk bar's Country restriction control) |
| `notStartedUrl` | http(s) URL visitors see before the link's `startsAt`, or `null` to clear it |
| `notes` | Private internal note set on every link; `null` or empty string clears it |
| `autoFailoverEnabled` | `false` to stop automatic failover to backup destinations when the primary is down, `true` to re-enable |
| `cloaked` | `true` to serve the destination inside a masked frame (URL cloaking), `false` to turn it off |
| `pinned` | `true` pins the links to the top of the links view, `false` unpins |
| `redirectStatus` | `301`, `302`, `307` or `308` (`null` resets to the 307 default). Permanent codes are refused, for the whole batch, on any link that ends up with a password, expiry, go-live date, click limit or targeting rules |
| `password` | 4-128 chars: protect every link with this password (hashed once per batch; never returned or written to the audit log, which records only `passwordProtected`), or `null` to remove protection. Existing unlock cookies stop working |
| `maxClicks` | integer 1-1,000,000,000, or `null` to remove the click limit |
| `dailyClickCap` | integer 1-10,000,000 clicks per UTC day, or `null` to remove the cap |
| `extendExpiryDays` | integer 1-3650; moves each link's own expiry out by N days from the later of its expiry and now. Links with no expiry are left unchanged. Cannot be combined with `expiresAt` |
| `archived` | `true` pauses the link, `false` restores it |
| `trash` | `true` moves the links to the trash (restorable for the retention window from `/manage/trash`). Must be the only change; audited per link as `trashed: false → true` |
| `utm` or `utmTemplateId` | fill `utm_*` on the destination. Existing non-empty values are kept. Creates a destination revision. Template must belong to the links' workspace |

## Guarantees

- **Atomic.** Every link is checked first (exists and visible to you, editor role, folder rights, tag cap). If any fails nothing is written and the response lists each failure: `{ "error": "…", "failures": [{ "link": "promo", "reason": "Editor permission is required" }] }` (403/404).
- **Audited.** Each link that actually changed gets a `link.bulk_edit` audit event with before/after values and the batch size.
- **Idempotent.** Links that already match are counted in `unchanged` and are not rewritten.
- Redirect caches are invalidated after commit; UTM changes also fire `link.updated` webhooks.

Response: `{ "updated": 2, "unchanged": 1, "links": [{ "id": "…", "shortCode": "…" }] }`.

In the app: tick links on Account → Your links, then use the bar that appears.

## Idempotency

Send an `Idempotency-Key` header (8–255 chars) with `PATCH /api/bulk/edit`. A retry with the same key and body within 24 hours returns the stored response with `Idempotent-Replay: true` and does not re-apply the edit or write duplicate audit events. Reusing a key with a different body returns 400. Keys are scoped to the caller's primary workspace.

## Dry run

Add `"dryRun": true` to preview a batch. It runs every check a real edit does (visibility, editor role, folder rights, tag cap, redirect-status compatibility) and returns `{ "dryRun": true, "wouldUpdate": 2, "unchanged": 1, "changes": [{ "id", "shortCode", "before", "after" }] }`. Nothing is written, audited, cache-invalidated or webhooked, and `Idempotency-Key` is ignored. Failures return the same 403/404 body as a real edit.

## Destination rewrite

`changes.rewriteDestination` migrates destinations in bulk (cannot combine with `utm`):

- `{ "mode": "host", "from": "old.com", "to": "new.com" }` swaps the hostname and its subdomains, keeping path and query.
- `{ "mode": "prefix", "host": "example.com", "from": "/blog", "to": "/articles" }` rewrites a path prefix on a segment boundary.
- `{ "mode": "text", "find": "...", "replace": "..." }` literal (non-regex) replace.

Every result must be http(s), at most 2048 chars and must not introduce a new link-safety concern; otherwise the whole batch is refused and nothing changes. Use `dryRun: true` to preview. Each rewrite writes a destination revision ("Bulk destination rewrite") and an audit event.

## Retargeting pixels

`changes.pixels` sets or clears retargeting pixel ids on every selected link in the same transaction:

```json
{ "links": ["promo", "sale"], "changes": { "pixels": { "meta": "1234567890", "google": "G-ABCD1234", "tiktok": null } } }
```

Providers: `meta`, `google`, `x`, `linkedin`, `tiktok`. `null` or an empty string clears that provider; providers you omit are untouched. Ids use the same format checks as the single-link editor, so a bad id rejects the whole request (400) before anything is written. Each changed link gets an audit event with before/after ids, and `dryRun` previews the diff.
