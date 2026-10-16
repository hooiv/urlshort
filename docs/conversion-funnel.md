# Conversion funnel

`GET /api/analytics/:shortCode/funnel?steps=lead,sale&days=30`

Ordered goal funnel for one link: human clicks, then each goal key in order (1-6 unique keys, `days` is 7, 30 or 90).
A step counts only clicks that also converted on every earlier step, so counts never increase and `dropOff` is
meaningful. Each step reports `count`, `stepRatePct` (of the previous step), `overallRatePct` (of human clicks) and `dropOff`.
Auth: session or API key with `analytics:read` / `links:read`. Bots are excluded.
