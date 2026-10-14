# Redirect status codes

Each link can choose 301, 302, 307 (default) or 308 via `PATCH /api/links/:code` `{ "redirectStatus": 301 }` (null resets) or the Redirect type selector in the link manager.

- 307 / 302: `Cache-Control: private, no-store`, edits apply immediately.
- 301 / 308: `Cache-Control: public, max-age=3600`; passes SEO equity. Refused (400) while the link has a password, expiry, go-live date, click limit or targeting rules, because browsers would cache past those gates.
- Crawlers, gated links and rule-matched visits are always answered with 307 regardless of the stored value.
