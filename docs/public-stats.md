# Public stats pages

Owners can publish a read-only dashboard for a single link, e.g. to share results with a client.

- `POST /api/links/:code/public-stats` enables sharing (or rotates the token) and returns the URL token **once**. `DELETE` revokes it. `GET` reports whether sharing is on.
- Public page: `/stats/<token>?range=7d|30d|90d|365d` (noindex). JSON: `GET /api/public-stats/<token>` (rate limited, 60s cache).
- Tokens are 256-bit random (`qls_…`); only the SHA-256 is stored. Unknown or revoked tokens return 404.
- The payload is aggregate-only: daily clicks, countries, devices, referrers. No IPs, no destination URL, no other links.
