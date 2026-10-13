# Links export

`GET /api/links/export?format=csv|json&workspaceId=` (session, or API key with `links:read`/`links:write`) returns every non-trashed link in the account or workspace: short code, destination, title, tags, folder, clicks, active flag, password-protected flag (never the hash), created/starts/expires timestamps.

- CSV is RFC 4180 quoted; cells starting with `= + - @` are prefixed with `'` so spreadsheets don't run them as formulas. Tags are `;`-joined.
- Capped at 50,000 links; `X-Export-Truncated: true` (and `truncated` in JSON) marks a larger scope.
- Workspace members who are not admins only export their own links.
- Rate limited to 10/min; each export writes a `links.export` audit event.
