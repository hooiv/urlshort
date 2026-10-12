# Custom link previews (Open Graph)

Each link can carry its own `title`, `description` and `ogImage`. These are served **only to social crawlers**
(Facebook, X, LinkedIn, Slack, WhatsApp, Discord…): the crawler gets a minimal HTML page with OG/Twitter tags and a
refresh to the destination. Humans are redirected with a plain 302, so there is no added latency.

If `ogImage` is empty, a generated card at `/api/links/:code/og` is used.

## API
`PATCH /api/links/:code` (API key scope `links:write`) and `POST /api/shorten` accept:

| field | rule |
|---|---|
| `title` | ≤ 200 chars, control characters stripped |
| `description` | ≤ 300 chars |
| `ogImage` | absolute `https` URL (http only for localhost), ≤ 2048 chars, no credentials |

Invalid values return `400` with a message. Send `null` or `""` to clear a field.
All values are HTML-escaped when rendered.
