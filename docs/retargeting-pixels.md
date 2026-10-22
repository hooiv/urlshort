# Retargeting pixels

Per-link pixels for Meta, Google (GA4/Ads/Floodlight/GTM), X, LinkedIn Insight, TikTok and Pinterest Tag.

- Set via `PATCH /api/links/:code` (`metaPixelId`, `googleTagId`, `xPixelId`, `linkedinPartnerId`, `tiktokPixelId`, `pinterestTagId`) or on `POST /api/shorten`. IDs are validated per provider (400 on bad format) so they can only be emitted as inert literals.
- Redirect: a minimal invisible page dispatches the tags and navigates after at most 250 ms; it never waits on vendor scripts. Served with a CSP restricted to the five vendor hosts, `no-store`.
- Consent: pixels are skipped (plain 307) when the visitor sends `Sec-GPC: 1`, `DNT: 1` or a `ql_consent=0|denied|reject|false` cookie. Click analytics are unaffected.
- Cloaked links keep the iframe page and never load pixels.
- UI: Manage link → Retargeting & Link Cloaking.
