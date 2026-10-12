# Traffic channels

`GET /api/analytics/:shortCode/channels?days=30`

Human clicks (bots excluded) grouped by referrer host and classified into `search`, `social`, `email`,
`messaging`, `other` and `direct` (no referrer). Each channel returns `clicks`, `share` (percent of human
clicks, one decimal) and its top three referrer hosts. `days` is 1-365. Hosts are matched on whole DNS
labels (so `l.facebook.com` is social, `notfacebook.com` is other). Email and messaging are checked first
so `mail.google.com` is email, not search.

Auth: session or API key with `analytics:read` / `links:read`. Rate limit 60/min. One grouped query on
`(urlId, createdAt)`, capped at 500 hosts. Shown on the link analytics page under "Traffic channels".
