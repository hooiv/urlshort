import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** RFC 6238 TOTP (SHA-1, 6 digits, 30s) with RFC 4648 base32 secrets. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error('Invalid base32 secret')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export function generateTotpSecret(): string { return base32Encode(randomBytes(20)) }

export function totpCode(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest()
  const off = h[h.length - 1] & 0xf
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/**
 * Verify a code within ±window steps. Returns the matched counter (so callers
 * can store it and reject replays of the same step) or null.
 */
export function verifyTotp(secretB32: string, code: string, opts: { now?: number; window?: number; lastUsedCounter?: number | null } = {}): number | null {
  const token = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(token)) return null
  const now = opts.now ?? Date.now()
  const window = opts.window ?? 1
  const current = Math.floor(now / 1000 / TOTP_STEP_SECONDS)
  let matched: number | null = null
  for (let c = current - window; c <= current + window; c++) {
    if (c < 0) continue
    const expected = Buffer.from(totpCode(secretB32, c))
    // constant-time over all candidates: do not short-circuit
    if (timingSafeEqual(expected, Buffer.from(token)) && matched === null) matched = c
  }
  if (matched === null) return null
  if (opts.lastUsedCounter != null && matched <= opts.lastUsedCounter) return null
  return matched
}

export function otpauthUri(secretB32: string, account: string, issuer = 'QuickLink'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) })
  return `otpauth://totp/${label}?${q.toString()}`
}

// --- secret at rest: AES-256-GCM, key derived from QL_MFA_KEY ---
function key(): Buffer {
  const raw = process.env.QL_MFA_KEY
  if (!raw || raw.length < 32) throw new Error('QL_MFA_KEY must be set (32+ chars) to use two-factor authentication')
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split('.')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret format')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
}

// --- recovery codes ---
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10)
    const s = Array.from(b, (x) => RC_ALPHABET[x % RC_ALPHABET.length]).join('')
    return `${s.slice(0, 5)}-${s.slice(5)}`
  })
}
export function normalizeRecoveryCode(code: string): string { return code.replace(/[\s-]/g, '').toUpperCase() }
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}
