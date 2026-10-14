# Saved views

Save the links-table search and tag filter as a named view (max 25 per user) and re-apply it in one click from /account.

- `GET /api/views` (links:read), `POST /api/views {name, filters}` (links:write, upserts by name), `DELETE /api/views/:id`.
- Filters: `q`, `tags`, `folderId`, `status`, `sort` (strict schema). The UI currently saves and applies `q` and one tag.
