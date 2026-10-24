# Expire after first click

Set `lifetimeMinutes` (1 to 525600) on a link via `PATCH /api/links/:code` (or the Expiration section in Manage). The countdown starts at the first **human** click; once `firstClickAt + lifetimeMinutes` passes, visitors get the link's `expiredUrl` (or `/expired`). Crawlers and bots never start the clock.

- The clock is started with a single atomic `UPDATE ... COALESCE("firstClickAt", now) RETURNING`, so concurrent first clicks agree on one start time.
- Changing or clearing `lifetimeMinutes` re-arms the clock; re-saving the same value does not extend it.
- Links with a lifetime are served by the main route (like click caps), never the cached edge route.
- Response includes `lifetimeMinutes` and `firstClickAt`.
