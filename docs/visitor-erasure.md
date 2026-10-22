# Visitor erasure (data-subject deletion)

`POST /api/workspaces/:id/privacy/erasure` (owner/admin session) with `{ "ip": "203.0.113.9" }` and/or `{ "visitorId": "..." }` deletes that visitor's raw click events across the workspace. Both raw and workspace-salted hashed values are matched, so clicks stored under any privacy policy are covered. Add `"dryRun": true` to count matches first. Daily rollups hold no personal data and are kept, so totals are unchanged. Each real erasure writes a `privacy.erasure` audit event with the deleted count (never the identifier).
