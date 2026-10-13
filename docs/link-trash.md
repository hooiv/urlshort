# Link trash

Deleting a link no longer destroys it. `DELETE /api/links/:code` moves it to the trash: redirects stop immediately (the redirect cache is invalidated), but clicks, rules and the short code are kept for 30 days.

| Endpoint | Purpose | Auth |
|---|---|---|
| `DELETE /api/links/:code` | Move to trash | session / `links:write` key / management token |
| `DELETE /api/links/:code?permanent=true` | Erase now, cascading analytics | same |
| `GET /api/links/trash` | Trashed links in the window, with `daysLeft` | `links:read` or `links:write` |
| `POST /api/links/:code/restore` | Restore (409 if not trashed, 410 if the window passed) | `links:write` or edit role |

Audit actions: `link.trash`, `link.restore`, `link.delete` (permanent). The `/api/cron/trash` job (daily 03:30 UTC) hard-deletes links past retention. The UI lives at `/manage/trash`. A trashed short code stays reserved until purge so a restore can never collide with a new link.
