# Link pre-flight

`POST /api/links/preflight { url, workspaceId? }` (session or API key with `links:read`, 30 req/min) checks a destination before a link exists: validity, scheme, embedded credentials, one-off click IDs (fbclid, gclid, ...), risk heuristics, reachability/latency/redirect host, and existing links to the same page.

The create form calls it automatically, debounced 700 ms after the URL parses as http(s) with a dotted host; stale requests are aborted. Results are advisory: errors and warnings are shown inline, and creation is still validated server side.
