// @quicklink/sdk smoke test (plain node, no network).
//
// Exercises the built client (./dist/index.js) against an in-memory mock
// fetch: link CRUD, resolve, analytics query encoding, webhooks (incl. 204),
// campaigns (backward compat), typed errors incl. Retry-After, idempotency
// headers, AbortSignal + timeout behaviour, and no-secret-leakage guarantees.
import assert from 'node:assert/strict'
import {
  AuthenticationError,
  NotFoundError,
  QuickLinkClient,
  QuickLinkError,
  RateLimitError,
  ValidationError,
  createClient,
  isApiKeyFormat,
  isAuthenticationError,
  isNotFoundError,
  isQuickLinkError,
  isRateLimitError,
  isValidationError,
  retryAfterMs,
} from './dist/index.js'

const API_KEY = 'qlk_testprefix_testsecretvalue123456'
let passed = 0
const ok = (name) => { passed += 1; console.log(`ok - ${name}`) }

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

function mockClient(responder, clientOptions = {}) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return responder(String(url), init, calls.length)
  }
  const client = createClient({ baseUrl: 'https://links.example.com/', apiKey: API_KEY, fetch, ...clientOptions })
  return { client, calls }
}

const authHeader = (call) => new Headers(call.init.headers).get('x-api-key')

// 1. Construction + validation ------------------------------------------------
{
  const { client, calls } = mockClient(() => json({ ok: true }))
  await client.listCampaigns()
  assert.match(calls[0].url, /^https:\/\/links\.example\.com\/api\/v1\/campaigns$/)
  ok('baseUrl trailing slash is normalized')
  assert.throws(() => createClient({ baseUrl: '', apiKey: API_KEY }), TypeError)
  assert.throws(() => createClient({ baseUrl: 'https://x.test' }), TypeError)
  assert.throws(() => createClient({ baseUrl: 'ftp://x.test/files', apiKey: API_KEY }), TypeError)
  assert.ok(new QuickLinkClient({ baseUrl: 'https://x.test', apiKey: API_KEY }) instanceof QuickLinkClient)
  assert.ok(createClient({ baseUrl: 'https://x.test', apiKey: API_KEY }) instanceof QuickLinkClient)
  ok('constructor validates baseUrl/apiKey')
}

// 2. shorten ------------------------------------------------------------------
{
  const { client, calls } = mockClient((url) => {
    assert.match(url, /\/api\/shorten$/)
    return json({ id: 'u1', originalUrl: 'https://example.com/a', shortCode: 'abc123', shortUrl: 'https://links.example.com/abc123', clicks: 0, createdAt: new Date().toISOString() }, 201)
  })
  const out = await client.shorten({ url: 'https://example.com/a', tags: ['news'] })
  assert.equal(out.shortCode, 'abc123')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(authHeader(calls[0]), API_KEY)
  assert.equal(JSON.parse(calls[0].init.body).url, 'https://example.com/a')
  ok('shorten POSTs JSON with x-api-key auth')
}

// 3. listLinks query encoding ---------------------------------------------------
{
  const { client, calls } = mockClient(() => json({ links: [], nextCursor: null }))
  await client.listLinks({ search: 'a b', take: 25 })
  assert.match(calls[0].url, /\/api\/shorten\?/)
  assert.match(calls[0].url, /search=a(\+|%20)b/)
  assert.match(calls[0].url, /take=25/)
  await client.listLinks({ search: undefined, tag: undefined })
  assert.equal(calls[1].url, 'https://links.example.com/api/shorten')
  ok('listLinks encodes query params and drops undefined')
}

// 4. getLink / resolve / update / delete ----------------------------------------
{
  const detail = { id: 'u1', originalUrl: 'https://example.com/a', shortCode: 'ab c/d' }
  const { client, calls } = mockClient((url, init) => {
    if (init.method === 'PATCH') return json({ ...detail, title: 'New' })
    if (init.method === 'DELETE') return json({ deleted: true, shortCode: 'ab c/d' })
    return json(detail)
  })
  const got = await client.getLink('ab c/d')
  assert.equal(got.originalUrl, 'https://example.com/a')
  assert.match(calls[0].url, /\/api\/links\/ab%20c%2Fd$/)
  const resolved = await client.resolve('ab c/d')
  assert.equal(resolved.originalUrl, 'https://example.com/a')
  const updated = await client.updateLink('ab c/d', { title: 'New' })
  assert.equal(updated.title, 'New')
  assert.equal(calls[2].init.method, 'PATCH')
  const deleted = await client.deleteLink('ab c/d')
  assert.equal(deleted.deleted, true)
  assert.equal(calls[3].init.method, 'DELETE')
  ok('link CRUD + resolve alias with path encoding')
}

// 5. analytics ------------------------------------------------------------------
{
  const { client, calls } = mockClient(() => json({ url: {}, window: {}, analytics: {} }))
  const res = await client.getAnalytics('abc', { range: '7d', country: 'US' })
  assert.ok(res.analytics)
  assert.match(calls[0].url, /\/api\/analytics\/abc\?/)
  assert.match(calls[0].url, /range=7d/)
  assert.match(calls[0].url, /country=US/)
  ok('getAnalytics serializes filters as query params')
}

// 6. webhooks incl. 204 empty body ------------------------------------------------
{
  const { client, calls } = mockClient((url, init) => {
    if (url.endsWith('/api/webhooks') && init.method === 'GET') return json([{ id: 'w1', url: 'https://hook.test/x', isActive: true, events: ['link.clicked'], createdAt: '', updatedAt: '' }])
    if (url.endsWith('/api/webhooks') && init.method === 'POST') return json({ id: 'w2', url: 'https://hook.test/x', secret: 'shh' }, 201)
    if (url.endsWith('/test')) return json({ success: true, statusCode: 200 })
    return new Response(null, { status: 204 })
  })
  const list = await client.listWebhooks()
  assert.equal(list[0].id, 'w1')
  const created = await client.createWebhook({ url: 'https://hook.test/x', events: ['link.clicked'] })
  assert.equal(created.secret, 'shh')
  const probed = await client.testWebhook('w1')
  assert.equal(probed.success, true)
  const deleted = await client.deleteWebhook('w1')
  assert.equal(deleted, undefined)
  assert.equal(calls[3].init.method, 'DELETE')
  ok('webhook CRUD incl. 204-void delete and test probe')
}

// 7. campaigns (backward compat) + idempotency ------------------------------------
{
  const { client, calls } = mockClient((url) => {
    if (url.endsWith('/api/v1/campaigns')) return json([])
    if (url.endsWith('/api/v1/campaigns/create')) return json({ campaign: { id: '1' } }, 201)
    return json({ id: 'c9' })
  })
  await client.listCampaigns()
  await client.createCampaign(
    { name: 'x', slug: 'x', variants: [{ name: 'a', destinationUrl: 'https://a.test', weight: 100 }] },
    { idempotencyKey: 'idem-123' },
  )
  assert.equal(new Headers(calls[1].init.headers).get('Idempotency-Key'), 'idem-123')
  await client.getCampaign('c9')
  assert.match(calls[2].url, /\/api\/campaigns\/c9$/)
  ok('campaign methods preserved; Idempotency-Key forwarded')
}

// 8. typed errors -----------------------------------------------------------------
{
  // Legacy construction shape keeps working.
  assert.equal(new QuickLinkError(429, { error: 'limited' }).status, 429)
  const { client } = mockClient((url, init) => {
    if (init.method === 'POST' && url.endsWith('/api/unfurl')) return json({ url: 'https://example.com', title: null, description: null, image: null, icon: null, siteName: 'example.com' })
    throw new Error(`unexpected ${init.method} ${url}`)
  })
  const meta = await client.unfurlUrl({ url: 'https://example.com' })
  assert.equal(meta.siteName, 'example.com')

  const errFor = async (status, body, headers = {}) => {
    const { client: c } = mockClient(() => json(body, status, headers))
    return c.listWebhooks().then(() => assert.fail('should throw'), (e) => e)
  }
  const rl = await errFor(429, { error: 'Too many requests' }, { 'Retry-After': '30' })
  assert.ok(rl instanceof RateLimitError && rl instanceof QuickLinkError)
  assert.equal(rl.retryAfter, 30)
  assert.equal(rl.retryAfterSeconds, 30)
  assert.equal(retryAfterMs(rl), 30000)
  assert.ok(isRateLimitError(rl) && isQuickLinkError(rl))
  const auth = await errFor(401, { error: 'Unauthorized' })
  assert.ok(auth instanceof AuthenticationError && isAuthenticationError(auth))
  assert.equal(auth.code, 'unauthorized')
  const forbidden = await errFor(403, { error: 'nope' })
  assert.equal(forbidden.code, 'forbidden')
  const bad = await errFor(400, { error: 'URL is required' })
  assert.ok(bad instanceof ValidationError && isValidationError(bad))
  const conflict = await errFor(409, { error: 'taken' })
  assert.equal(conflict.code, 'conflict')
  const missing = await errFor(404, { error: 'nope' })
  assert.ok(missing instanceof NotFoundError && isNotFoundError(missing))
  const server = await errFor(500, { error: 'boom', requestId: 'r1' })
  assert.ok(server instanceof QuickLinkError && !(server instanceof RateLimitError))
  assert.equal(server.requestId, 'r1')
  const { client: c2 } = mockClient(() => new Response('gateway exploded', { status: 502, headers: { 'content-type': 'text/plain' } }))
  const nonJson = await c2.listWebhooks().then(() => assert.fail('should throw'), (e) => e)
  assert.equal(nonJson.body.error, 'HTTP 502')
  ok('typed errors map status codes; Retry-After parsed; non-JSON safe')
}

// 9. AbortSignal + timeout ----------------------------------------------------------
{
  const hanging = (_url, init = {}) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal.reason))
  })
  const { client, calls } = mockClient(hanging, { timeoutMs: 0 })
  const controller = new AbortController()
  const pending = client.getLink('abc', { signal: controller.signal })
  controller.abort(new Error('user-cancel'))
  await pending.then(() => assert.fail('should abort'), (e) => assert.equal(e.message, 'user-cancel'))
  assert.equal(calls.length, 1)

  const preAborted = AbortSignal.abort(new Error('already'))
  const before = calls.length
  await client.getLink('abc', { signal: preAborted }).then(() => assert.fail('should throw'), (e) => assert.equal(e.message, 'already'))
  assert.equal(calls.length, before)

  const { client: speedy } = mockClient(hanging, { timeoutMs: 20 })
  await speedy.getLink('abc').then(() => assert.fail('should time out'), (e) => assert.equal(e.name, 'TimeoutError'))
  ok('AbortSignal cancels in-flight; pre-aborted short-circuits; timeoutMs raises TimeoutError')
}

// 10. no secret leakage ----------------------------------------------------------------
{
  const { client } = mockClient(() => json([]))
  assert.ok(!JSON.stringify(client).includes(API_KEY))
  assert.ok(!JSON.stringify(client).includes('testsecret'))
  assert.deepEqual({ ...client.toJSON() }, { baseUrl: 'https://links.example.com' })
  const { client: c } = mockClient(() => json({ error: 'nope' }, 403))
  const err = await c.getLink('x').then(() => assert.fail('should throw'), (e) => e)
  assert.ok(!String(err.message).includes(API_KEY))
  assert.ok(!JSON.stringify(err.body).includes(API_KEY))
  assert.equal(isApiKeyFormat(API_KEY), true)
  assert.equal(isApiKeyFormat('not-a-key'), false)
  ok('apiKey never serialized into JSON, messages, or bodies')
}

console.log(`SDK smoke tests passed (${passed} groups)`)
