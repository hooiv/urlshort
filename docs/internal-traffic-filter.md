# Internal traffic filter

Workspace owners/admins can list up to 20 IPs or CIDR ranges (IPv4/IPv6) whose clicks are
redirected normally but dropped at ingestion, so team testing never pollutes analytics.

- UI: `/manage/privacy` (includes "Add my IP").
- API: `PATCH /api/workspaces/:id/privacy` with `analyticsExclusions: string[]` (400 on invalid entries);
  `GET /api/workspaces/:id/privacy/my-ip` returns the caller's IP as the server sees it and whether it is already excluded.
- Matching: `src/lib/analytics-exclusions.ts`; unknown IPs are never excluded.
- Existing clicks are not retroactively removed.
