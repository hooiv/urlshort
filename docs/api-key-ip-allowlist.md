# API key IP allowlist

Restrict a key to known networks. A key with an empty allowlist works from anywhere.

- Create: `POST /api/account/api-keys` with `"allowedIps": ["203.0.113.0/24", "2001:db8::/32", "198.51.100.7"]`.
- Update: `PATCH /api/account/api-keys` with `{ "id": "...", "allowedIps": [...] }`; an empty array clears it. Audit action `api_key.update`.
- Limits: up to 20 entries, IPv4/IPv6, optional prefix length. Invalid entries return 400.
- Enforcement: `authenticateApiKey` compares the client IP (`x-forwarded-for` first hop, then `x-real-ip`) to the list. A request from outside the list, or with no determinable IP, is treated as an invalid key (401), so every API-key route is covered.
- IPv4-mapped IPv6 (`::ffff:10.0.0.1`) matches IPv4 entries.
- Deploy behind a proxy that sets `x-forwarded-for`; otherwise restricted keys will always be rejected.
