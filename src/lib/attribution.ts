import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TOKEN_VERSION = 'v1'
type AttributionPayload = { urlId: string; shortCode: string; clickEventId: string; visitorIdHash: string; issuedAt: number }
function getSecret(): string { const secret = process.env.QL_ATTRIBUTION_SECRET; if (!secret || secret.length < 32) throw new Error('QL_ATTRIBUTION_SECRET must be at least 32 characters'); return secret }
function sign(encodedPayload: string): string { return createHmac('sha256', getSecret()).update(`${TOKEN_VERSION}.${encodedPayload}`).digest('base64url') }
export function hashVisitorId(visitorId: string): string { return createHmac('sha256', getSecret()).update(`visitor:${visitorId}`).digest('hex') }
export function createAttributionToken(payload: AttributionPayload): string { const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'); return `${TOKEN_VERSION}.${encoded}.${sign(encoded)}` }
export function verifyAttributionToken(token: string): AttributionPayload | null {
  const [version, encoded, signature] = token.split('.'); if (version !== TOKEN_VERSION || !encoded || !signature) return null
  const expected = sign(encoded); const expectedBuffer = Buffer.from(expected, 'utf8'); const actualBuffer = Buffer.from(signature, 'utf8'); if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null
  try { const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AttributionPayload; if (!payload.urlId || !payload.shortCode || !payload.clickEventId || !payload.visitorIdHash || !payload.issuedAt) return null; const age = Date.now() - payload.issuedAt; if (age < 0 || age > TOKEN_TTL_MS) return null; return payload } catch { return null }
}
export function appendAttribution(destination: string, token: string): string { const url = new URL(destination); const current = url.hash.replace(/^#/, ''); const params = new URLSearchParams(current); params.set('ql_attribution', token); url.hash = params.toString(); return url.toString() }
export function generatePublicEventKey(name: string): string { const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48); return normalized || `goal_${Math.random().toString(36).slice(2, 10)}` }
