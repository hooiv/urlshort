# Tag rename and merge

`POST /api/tags/rename` with `{ "from": "promo", "to": "sale", "workspaceId": "optional" }`.
Needs a session or an API key with `links:write`; workspace callers need an editor role or higher.

- Tags are lowercased and trimmed. Renaming onto an existing tag merges them; a link holding both keeps one copy.
- Only links the caller can see and edit are touched (restricted folders respected). Trashed links are skipped.
- All-or-nothing: if any link would exceed 20 tags the call returns 422 and changes nothing.
- Link caches are invalidated and a `tag.rename` audit event is written.
- Response: `{ from, to, updated }`.

## Delete a tag

`DELETE /api/tags` with `{ "tag": "promo", "workspaceId"?: "..." }` removes the tag from every editable, non-trashed link in one transaction (editor role required in workspaces), invalidates redirect caches and writes a `tag.delete` audit entry. Response: `{ tag, updated }`.
