# @quicklink/sdk

Typed, dependency-free TypeScript client for the QuickLink API (links,
analytics, webhooks, campaigns). The client is generated from
[`openapi.json`](./openapi.json) — which is spot-checked against the real
`src/app/api` route handlers — plus a small hand-written helper layer in
[`src/client.ts`](./src/client.ts). Public entry point: `index.ts`.

## Install

Requires Node 18+ (Node 22 recommended) and no runtime dependencies.

```sh
npm install @quicklink/sdk
```

From this monorepo you can also build the SDK directly:

```sh
npm --prefix sdk run build   # regenerate src/generated.ts, then typecheck + emit dist/
npm --prefix sdk test        # build + run the offline smoke test (no network)
npm --prefix sdk run verify  # re-generate and check the contract against src/app/api
```

`npm run build` uses the repo-root TypeScript compiler
(`../node_modules/typescript/bin/tsc`) because `typescript` is not installed
under `sdk/` (deliberately — no `npm install` side effects inside `sdk/`).

## Usage

```ts
import { createClient, RateLimitError } from '@quicklink/sdk'

const client = createClient({
  baseUrl: 'https://links.example.com', // your QuickLink deployment
  apiKey: process.env.QUICKLINK_API_KEY!, // `qlk_...`; sent as `x-api-key`
  timeoutMs: 15000, // default per-request timeout (0 disables)
})

// Shorten a URL
const link = await client.shorten({ url: 'https://example.com/article', tags: ['news'] })
console.log(link.shortUrl, link.shortCode)

// Resolve a code (authenticated alias of getLink)
const detail = await client.resolve(link.shortCode)
console.log(detail.originalUrl)

// Link CRUD
await client.listLinks({ search: 'example', take: 25 })
await client.getLink(link.shortCode)
await client.updateLink(link.shortCode, { title: 'New title', isActive: true })
await client.deleteLink(link.shortCode)

// Analytics (query filters are optional)
await client.getAnalytics(link.shortCode, { range: '7d', country: 'US' })

// Webhooks (secret is returned once, at creation)
const endpoint = await client.createWebhook({ url: 'https://app.example.com/hooks/clicks', events: ['link.clicked'] })
await client.listWebhooks()
await client.testWebhook(endpoint.id)
await client.deleteWebhook(endpoint.id) // 204 → resolves undefined

// Campaigns
await client.listCampaigns()
await client.createCampaign(
  { name: 'Launch', slug: 'launch', variants: [
    { name: 'A', destinationUrl: 'https://example.com/a', weight: 50 },
    { name: 'B', destinationUrl: 'https://example.com/b', weight: 50 },
  ] },
  { idempotencyKey: 'unique-key-per-write' }, // safe retries
)
await client.getCampaign('campaign-id')

// Page metadata (no auth required server-side, key is still sent harmlessly)
await client.unfurlUrl({ url: 'https://example.com/article' })
```

`new QuickLinkClient(options)` works identically; `createClient` is the
recommended factory. Query arguments (`listLinks`, `getAnalytics`) skip
`undefined`/`null` values and URL-encode the rest.

## Errors

Non-2xx responses throw typed errors, all extending `QuickLinkError`
(`status`, `body: { error, requestId? }`, `code`):

| Status | Class | Notes |
| --- | --- | --- |
| 429 | `RateLimitError` | `retryAfter` / `retryAfterSeconds` (seconds, from `Retry-After`) |
| 401 / 403 | `AuthenticationError` | `code` is `unauthorized` / `forbidden` |
| 400 / 409 / 422 | `ValidationError` | `code` is `bad_request` / `conflict` / `unprocessable` |
| 404 | `NotFoundError` | unknown or invisible resource |
| other | `QuickLinkError` | `code` is `http_<status>` |

```ts
import { RateLimitError, isRateLimitError, retryAfterMs } from '@quicklink/sdk'

try {
  await client.shorten({ url: 'https://example.com' })
} catch (error) {
  if (isRateLimitError(error)) {
    await new Promise((r) => setTimeout(r, retryAfterMs(error) ?? 1000))
  }
  throw error
}
```

Helper guards `isQuickLinkError`, `isAuthenticationError`,
`isValidationError`, `isNotFoundError`, plus `isApiKeyFormat(value)` and
`retryAfterMs(error)`, are exported from the package root.

## Timeouts and cancellation

Every request races a timeout (client default 15 s, overridable per call with
`timeoutMs`; `0` disables). Timeouts reject with a `TimeoutError`
`DOMException`. Pass an `AbortSignal` to cancel; a pre-aborted signal rejects
without hitting the network, and aborting mid-flight rejects with the
signal's reason:

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 500)
await client.getAnalytics('abc123', { range: '30d' }, { signal: controller.signal, timeoutMs: 10000 })
```

Custom `fetch` implementations can be injected via `createClient({ fetch })`.

## Secrets

The API key is sent only in the `x-api-key` header. The client never logs,
never includes the key in error messages or response bodies, and
`JSON.stringify(client)` serializes to `{ baseUrl }` only. The webhook
endpoint secret is returned by the API exactly once at creation — store it
immediately; list responses carry only a `secretHint`.

## Regenerating

```sh
npm run generate  # node scripts/generate.mjs — reads openapi.json + src/app/api, writes src/generated.ts
```

`src/generated.ts` starts with `// GENERATED FROM openapi.json - DO NOT
EDIT`. Edit `openapi.json` (additive corrections only — never remove paths
consumers rely on) or `scripts/generate.mjs`, then regenerate and rebuild.
`scripts/verify.mjs` enforces the header, the absence of app-internal
imports, full operation coverage, the required error/timeout surface, and
that every spec path still has a backing route handler.
