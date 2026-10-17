# Visitor blocklist

Per-link deny rules for abusive IPs/ranges and hotlinking referrers.

`PATCH /api/links/:code` with `{"visitorBlock":{"cidrs":["203.0.113.0/24","2001:db8::/32","198.51.100.7"],"referrerHosts":["scraper.example"]}}`; `null` clears it.
- Up to 100 entries per list; entries are canonicalised and deduplicated. Invalid entries return 400.
- Referrer hosts match the host and all subdomains.
- Blocked visitors are redirected (307) to `/region-unavailable`; no click is recorded. Evaluated after password/schedule/geo checks.
- Client IP comes from `x-forwarded-for` (first hop) or `x-real-ip`; run behind a trusted proxy. Referer is client-supplied, so treat referrer rules as best-effort.
- Same API-key scope as other link edits. UI: Visitor Blocklist card on the link manage page.
