# Zapier / Make / n8n hooks

REST-hook triggers for automation platforms. Subscriptions are regular webhook endpoints, so payload signing (`X-QuickLink-Signature-256`), SSRF checks, retries, the delivery log and auto-disable apply unchanged.

Auth: `Authorization: Bearer <api key>`. Scopes: `webhooks:write` to subscribe/unsubscribe, `links:read` (or `links:write`) for `new_link` polling, `analytics:read` (or a link scope) for `new_click` / `new_sale` polling.

| Trigger | Webhook event | Poll |
| --- | --- | --- |
| `new_link` | `link.created` | `GET /api/zapier/triggers/new_link` |
| `new_click` | `link.clicked` | `GET /api/zapier/triggers/new_click` |
| `new_sale` | `conversion.recorded` | `GET /api/zapier/triggers/new_sale` |

- `GET /api/zapier/me` — test authentication, returns `{ id, email, name }`.
- `POST /api/zapier/hooks` `{ "target_url", "event", "workspaceId"?, "tags"?, "shortCodes"?, "folderIds"?, "linkScope"? }` → `201 { "id", "event" }`. `event` is a trigger key or webhook event name. Filters behave as on `/api/webhooks`.
- `DELETE /api/zapier/hooks/:id` → `204`.
- Polling returns a newest-first array (max `limit`, default 25, cap 100) with stable `id`s for Zapier de-duplication. Only links the key's owner can see are returned (restricted folders respected). Click payloads omit IP and user agent; bots are excluded.
