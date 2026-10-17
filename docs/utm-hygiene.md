# UTM hygiene

`GET /api/links/utm-hygiene?workspaceId=&limit=50` lists active links whose UTM values fragment analytics
("Facebook" vs "facebook", "spring sale" vs "spring-sale", repeated `utm_*` keys, uppercase key names)
together with a corrected URL. Auth: session or API key with `analytics:read` / `links:read`.

Fixes are applied from `/manage/utm-hygiene` (per link or "fix all") through destination revisions, so they are
undoable. Only `utm_*` params are rewritten; every other param and the fragment keep their original encoding.
Malformed percent-encoding is left alone rather than guessed at.
