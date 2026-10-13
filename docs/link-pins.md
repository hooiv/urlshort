# Pinned links

Pin up to 20 links to the top of the links table.

- `PATCH /api/links/:code` with `{ "pinned": true | false }` (scope: link write). Stored as `pinnedAt`.
- `GET /api/shorten` (link list): the unfiltered first page lists pinned links first (most recently pinned first); `?pinned=1` returns only pinned links. Pagination cursors still follow `createdAt` of regular rows.
- UI: Pin/Unpin action and a "pinned" badge on each link card.
- Index `(userId, pinnedAt)` keeps the pinned lookup cheap.
