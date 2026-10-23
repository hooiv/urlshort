# Reassign link ownership

`POST /api/workspaces/:id/reassign-links` (owner/admin session) hands every link a member created in the workspace to another member, for offboarding.

Body: `{ fromUserId, toUserId, dryRun?, confirm? }`. Use `dryRun: true` to preview counts (active and trashed). A real run needs `confirm: true`. The target must be a member with editor role or higher. Trashed links move too. Short codes, clicks and settings are unchanged. Audited as `workspace.links_reassign`.
