# UTM breakdown

`GET /api/analytics/:shortCode/utm?by=source|medium|campaign|term|content&days=30&limit=10`

Human clicks (bots excluded) grouped by one UTM dimension. Clicks without a value fall into `(none)`.
Values beyond `limit` (1-50) are folded into `otherClicks`. `days` is 1-365. `share` is a percentage of
all human clicks in the window, one decimal.

Auth: session or API key with `analytics:read` / `links:read`. Rate limit: 60/min. The dimension is
whitelisted before it reaches SQL; the query uses the `(urlId, createdAt)` index. Shown on the link
analytics page under "UTM breakdown".
