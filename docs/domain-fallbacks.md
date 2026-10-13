# Domain fallbacks

Each verified branded domain can define two fallbacks, like Dub's root-domain redirect and Short.io's 404 redirect.

- `rootRedirectUrl`: where `https://go.acme.com/` goes (the bare domain would otherwise show a 404 page).
- `notFoundUrl`: where unknown or inactive paths on that domain go instead of QuickLink's `/404`.

API (needs `links:read` / `links:write`, an edit role, or the management token of the domain's owner link):

    GET   /api/links/:code/domain-settings?host=go.acme.com
    PATCH /api/links/:code/domain-settings?host=go.acme.com   {"rootRedirectUrl":"https://acme.com","notFoundUrl":null}

Rules: absolute http(s) URL, no credentials, must pass link-safety, may not point at the same domain (loop). `null` or `""` clears. Domain must be verified to write. Changes are audited as `branded_domain.fallbacks` and the domain cache is invalidated. UI: Manage → Domains → Fallbacks.
