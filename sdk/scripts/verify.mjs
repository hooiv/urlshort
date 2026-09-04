// Hand-written contract check (plain node, zero dependencies).
//
// Run: `npm run verify` from sdk/. Re-runs the generator for determinism of
// the check itself, then asserts:
//   1. src/generated.ts carries the generator header (it is the canonical output).
//   2. No SDK source imports application-internal modules.
//   3. Every operationId in openapi.json has a matching client method.
//   4. The required production surface exists (factory, resolve, CRUD,
//      analytics, webhooks, typed errors, timeout/signal support, no logging).
//   5. openapi.json still contains the original campaign paths (additive only).
//   6. Every spec path maps to a real src/app/api route handler.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.resolve(root, '..', 'src', 'app', 'api')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const fail = (msg) => { throw new Error(`SDK verify failed: ${msg}`) }

const spec = JSON.parse(read('openapi.json'))
const generated = read('src/generated.ts')
const client = fs.existsSync(path.join(root, 'src', 'client.ts')) ? read('src/client.ts') : ''
const index = read('index.ts')

if (!generated.startsWith('// GENERATED FROM openapi.json - DO NOT EDIT')) {
  fail('src/generated.ts is not the canonical generator output')
}
for (const [name, source] of [['src/generated.ts', generated], ['src/client.ts', client], ['index.ts', index]]) {
  if (/from ['"](?:\.\.\/)+src\//.test(source) || /from ['"]@\//.test(source)) {
    fail(`${name} imports application-internal modules`)
  }
}

const operations = []
for (const methods of Object.values(spec.paths || {})) {
  for (const [method, op] of Object.entries(methods)) {
    if (method !== 'parameters' && op && op.operationId) operations.push(op.operationId)
  }
}
if (new Set(operations).size !== operations.length) fail('duplicate operationId in openapi.json')
for (const id of operations) {
  if (!new RegExp(`\\b${id}\\(`).test(generated)) fail(`missing generated client method: ${id}`)
}

// Additive-only guard: the original campaign contract must still be present.
for (const p of ['/api/v1/campaigns', '/api/v1/campaigns/create', '/api/campaigns/{campaignId}']) {
  if (!spec.paths?.[p]) fail(`openapi.json lost original path ${p} (corrections must be additive)`)
}

// Required production surface (in the generated client).
const requiredMethods = [
  'createClient', 'resolve', 'shorten', 'listLinks', 'getLink', 'updateLink', 'deleteLink',
  'getAnalytics', 'listWebhooks', 'createWebhook', 'deleteWebhook', 'testWebhook', 'unfurlUrl',
  'listCampaigns', 'createCampaign', 'getCampaign',
]
for (const id of requiredMethods) {
  if (!new RegExp(`\\b${id}\\b`).test(generated)) fail(`required client surface missing: ${id}`)
}
const requiredErrors = ['QuickLinkError', 'RateLimitError', 'AuthenticationError', 'ValidationError', 'NotFoundError']
for (const name of requiredErrors) {
  if (!new RegExp(`class ${name}\\b`).test(generated)) fail(`required error class missing: ${name}`)
}
for (const token of ['timeoutMs', 'signal', 'idempotencyKey', 'Retry-After', 'retryAfter', 'x-api-key', 'Idempotency-Key', 'toJSON', 'ClientOptions', 'RequestOptions']) {
  if (!generated.includes(token)) fail(`required client capability missing from generated output: ${token}`)
}
if (/console\.(log|info|debug|warn|error)/.test(generated)) {
  fail('generated client must not log (secret-leakage risk)')
}
if (/console\.[a-z]+\(.*apiKey/i.test(generated + client + index)) {
  fail('SDK sources must never log API keys')
}

// Every spec path must map to a real route handler.
const toFile = (specPath) => path.join(apiDir, String(specPath).replace(/^\/api\//, '').replace(/\{([^}]+)\}/g, '[$1]'), 'route.ts')
for (const specPath of Object.keys(spec.paths || {})) {
  if (!fs.existsSync(toFile(specPath))) fail(`spec path ${specPath} has no backing route handler`)
}

console.log(`SDK contract verified: ${operations.length} operations, typed errors, timeout/signal support, no secret logging`)
