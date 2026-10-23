# Untitled links

`GET /api/links/untitled?workspaceId=&limit=50` lists active links whose title is empty or whitespace, most-clicked first, with the total and the untitled share (percent). Requires a session or an API key with `analytics:read` or `links:read`; rate limited to 60/min. Titles drive link lists, search and previews, so fix the busiest ones first.
