# Query forwarding policy

Per link, choose which incoming query parameters reach the destination:

- `all` (default): every parameter is merged into the destination.
- `none`: destination is served exactly as saved.
- `allowlist`: only the listed names (case-insensitive, max 25) pass.

`ql_*` parameters and credential-looking names (`password`, `access_token`, `id_token`, `refresh_token`, `api_key`, `apikey`, `secret`, `passwd`) are never forwarded in any mode.

API: `PATCH /api/links/:code` with `queryForwardMode` and `queryForwardAllow` (array of names). Invalid input returns 400. Also editable under Access Protection in the link manager.
