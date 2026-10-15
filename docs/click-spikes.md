# Click spikes

`GET /api/analytics/spikes?workspaceId=&windowHours=6|24|72&limit=25`

Flags active links whose human clicks in the last `windowHours` run at least 3x their own average for the same-sized window over the preceding 14 days, with a floor of 20 clicks. Severity: `notice` (>=3x), `surge` (>=8x), `viral` (>=20x). Links with no baseline return `ratio: null`. Bot and AI traffic is excluded. Auth: session or API key with `analytics:read` / `links:read`. UI: `/manage/spikes`.
