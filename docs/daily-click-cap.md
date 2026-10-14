# Daily click cap

Per-link `dailyClickCap` (1 to 10,000,000) limits billable clicks per UTC day. Set via `PATCH /api/links/:code` (`dailyClickCap`, null clears) or Manage → Expiration. Over-cap visitors get the link's expired URL (or /expired). Bots are not counted.

Admission is one atomic conditional UPDATE that rolls the counter over when the UTC day changes, so concurrent clicks admit exactly the cap (verified on Postgres). The total `maxClicks` reservation and tenant lease are handed back on rejection.
