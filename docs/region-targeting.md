# Region (state/province) targeting in routing rules

A routing rule's country field accepts ISO country codes (`US`) and country-region entries (`US-CA`, `IN-MH`). A region entry matches only when the CDN supplies the visitor's subdivision (`x-vercel-ip-country-region` or `cf-region-code`); with no region header it never matches, so a rule can fall through to the next one. Plain country entries behave as before. Works in the main redirect route, the edge route and `POST /api/links/:code/routing/preview` (optional `region`).
