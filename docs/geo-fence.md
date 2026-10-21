# Geo-fencing

Restrict a link to (`allow`) or block (`deny`) visitor countries.

`PATCH /api/links/:code` with `{"geoFence":{"mode":"allow","countries":["US","CA"],"allowUnknown":false}}`; `null` clears it.
Countries are ISO-3166 alpha-2 (case-insensitive, deduplicated). Allow-lists need at least one country. Unknown countries (`XX`, `T1`, missing header) pass for deny-lists and fail for allow-lists unless `allowUnknown` is set.
Blocked visitors are redirected (307) to `/region-unavailable`; no click is recorded. Evaluated after password and schedule checks, before smart routing.
Requires the same API-key scope as other link edits. The edge route (`/edge/:code`) enforces fences too: the fence rides in the signed routing snapshot, so changes apply after the next snapshot publish.

UI: Country Restrictions card on the link manage page (GeoFenceSection).
