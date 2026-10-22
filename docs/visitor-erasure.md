# Visitor erasure (data-subject deletion)

`POST /api/workspaces/:id/privacy/erasure` (owner/admin session) with `{ "ip": "203.0.113.9" }` and/or `{ "visitorId": "..." }` deletes that visitor's raw click events across the workspace. Both raw and workspace-salted hashed values are matched, so clicks stored under any privacy policy are covered. Add `"dryRun": true` to count matches first. Daily rollups hold no personal data and are kept, so totals are unchanged. Each real erasure writes a `privacy.erasure` audit event with the deleted count (never the identifier).

## Subject access (download)

`POST /api/workspaces/:id/privacy/access` with the same `{ ip }` / `{ visitorId }` body returns the click events held about that visitor (newest first, max 5000, `truncated` flags more). It matches exactly what erasure would delete. Stored IP and visitor hashes are not echoed. Each call writes a `privacy.access` audit event (counts only). The Privacy page has a "Download their data" button.
