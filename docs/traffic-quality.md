# Traffic quality

`GET /api/analytics/traffic-quality?workspaceId=&days=1|7|14|30|90` (session or API key with `analytics:read` / `links:read`).

Returns the human / bot / AI-agent split, the top AI agents fetching your links, links with at least 20 clicks and a non-human share above zero (ranked by share), and a daily human vs non-human series. Other dashboards count human clicks only; this one shows what was filtered out, which surfaces link scanners, scraped lists and click fraud. Shown on `/analytics` as the "Traffic quality" panel.
