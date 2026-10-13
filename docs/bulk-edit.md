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
| `notStartedUrl` | http(s) URL visitors see before the link's `startsAt`, or `null` to clear it |
| `cloaked` | `true` to serve the destination inside a masked frame (URL cloaking), `false` to turn it off |
| `password` | 4-128 chars: protect every link with this password (hashed once per batch; never returned or written to the audit log, which records only `passwordProtected`), or `null` to remove protection. Existing unlock cookies stop working |
| `maxClicks` | integer 1-1,000,000,000, or `null` to remove the click limit |
| `extendExpiryDays` | integer 1-3650; moves each link's own expiry out by N days from the later of its expiry and now. Links with no expiry are left unchanged. Cannot be combined with `expiresAt` |
| `archived` | `true` pauses the link, `false` restores it |
| `utm` or `utmTemplateId` | fill `utm_*` on the destination. Existing non-empty values are kept. Creates a destination revision. Template must belong to the links' workspace |

## Guarantees

- **Atomic.** Every link is checked first (exists and visible to you, editor role, folder rights, tag cap). If any fails nothing is written and the response lists each failure: `{ "error": "…", "failures": [{ "link": "promo", "reason": "Editor permission is required" }] }` (403/404).
- **Audited.** Each link that actually changed gets a `link.bulk_edit` audit event with before/after values and the batch size.
- **Idempotent.** Links that already match are counted in `unchanged` and are not rewritten.
- Redirect caches are invalidated after commit; UTM changes also fire `link.updated` webhooks.

Response: `{ "updated": 2, "unchanged": 1, "links": [{ "id": "…", "shortCode": "…" }] }`.

In the app: tick links on Account → Your links, then use the bar that appears.
