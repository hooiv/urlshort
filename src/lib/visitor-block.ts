// Pure JS (no node:net) so the edge runtime can import this module.
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6_GROUP_RE = /^[0-9a-f]{1,4}$/i

function isIP(v: string): 0 | 4 | 6 {
  if (IPV4_RE.test(v)) return 4
  if (!v.includes(':') || /[^0-9a-f:.]/i.test(v)) return 0
  let body = v
  let groupsNeeded = 8
  const dot = v.lastIndexOf('.')
  if (dot !== -1) {
    const c = v.lastIndexOf(':')
    if (!IPV4_RE.test(v.slice(c + 1))) return 0
    body = v.slice(0, c + 1) + '0:0'
    groupsNeeded = 8
  }
  const halves = body.split('::')
  if (halves.length > 2) return 0
  const parse = (h: string) => (h === '' ? [] : h.split(':'))
  const head = parse(halves[0])
  const rest = halves.length === 2 ? parse(halves[1]) : []
  if (![...head, ...rest].every((g) => IPV6_GROUP_RE.test(g))) return 0
  if (halves.length === 2) return head.length + rest.length <= groupsNeeded - 1 ? 6 : 0
  return head.length === groupsNeeded ? 6 : 0
}

/**
 * Per-link visitor blocklist: deny clicks from specific IPs/CIDR ranges or
 * from specific referring hosts (hotlinking, scraper sites, abusive sources).
 * Pure parse + match logic; callers supply the client IP and Referer header.
 */
export interface VisitorBlock {
  cidrs: string[]
  referrerHosts: string[]
}

export const MAX_BLOCK_ENTRIES = 100

export type VisitorBlockParse =
  | { ok: true; block: VisitorBlock | null }
  | { ok: false; error: string }

const HOST_RE = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Expand an IP to 16 bytes (IPv4 becomes an IPv4-mapped IPv6 address). */
export function ipToBytes(ip: string): Uint8Array | null {
  let v = ip.trim()
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1)
  const zone = v.indexOf('%')
  if (zone !== -1) v = v.slice(0, zone)
  const kind = isIP(v)
  if (kind === 0) return null
  const out = new Uint8Array(16)
  if (kind === 4) {
    out[10] = 0xff
    out[11] = 0xff
    v.split('.').forEach((p, i) => (out[12 + i] = Number(p)))
    return out
  }
  // IPv6, possibly with a trailing dotted IPv4 part
  let tail: number[] = []
  const dot = v.lastIndexOf('.')
  if (dot !== -1) {
    const c = v.lastIndexOf(':')
    const parts = v.slice(c + 1).split('.').map(Number)
    tail = [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]]
    v = v.slice(0, c + 1) + '0:0'
  }
  const [head, rest] = v.split('::')
  const h = head ? head.split(':') : []
  const r = rest !== undefined ? (rest ? rest.split(':') : []) : []
  const groups = rest === undefined ? h : [...h, ...Array(8 - h.length - r.length).fill('0'), ...r]
  if (groups.length !== 8) return null
  const words = groups.map((g) => parseInt(g, 16))
  if (tail.length) {
    words[6] = tail[0]
    words[7] = tail[1]
  }
  words.forEach((w, i) => {
    out[i * 2] = w >> 8
    out[i * 2 + 1] = w & 0xff
  })
  return out
}

interface ParsedCidr {
  bytes: Uint8Array
  bits: number
}

/** Normalises "1.2.3.4", "10.0.0.0/8", "2001:db8::/32". Returns null if invalid. */
export function parseCidr(input: string): { canonical: string; parsed: ParsedCidr } | null {
  const raw = input.trim()
  const slash = raw.indexOf('/')
  const addr = slash === -1 ? raw : raw.slice(0, slash)
  const bytes = ipToBytes(addr)
  if (!bytes) return null
  const v4 = isIP(addr.replace(/^\[|\]$/g, '')) === 4
  const max = v4 ? 32 : 128
  let prefix = max
  if (slash !== -1) {
    const p = raw.slice(slash + 1)
    if (!/^\d{1,3}$/.test(p)) return null
    prefix = Number(p)
    if (prefix > max) return null
  }
  const bits = v4 ? prefix + 96 : prefix
  // zero host bits so equal ranges dedupe
  const masked = new Uint8Array(bytes)
  for (let i = 0; i < 16; i++) {
    const keep = Math.max(0, Math.min(8, bits - i * 8))
    masked[i] &= keep === 0 ? 0 : (0xff << (8 - keep)) & 0xff
  }
  const text = v4 ? Array.from(masked.slice(12)).join('.') : addr.replace(/^\[|\]$/g, '').toLowerCase()
  const canonical = slash === -1 ? text : `${v4 ? text : text}/${prefix}`
  return { canonical, parsed: { bytes: masked, bits } }
}

function inCidr(ip: Uint8Array, c: ParsedCidr): boolean {
  for (let i = 0; i < 16; i++) {
    const keep = Math.max(0, Math.min(8, c.bits - i * 8))
    if (keep === 0) return true
    const mask = (0xff << (8 - keep)) & 0xff
    if ((ip[i] & mask) !== c.bytes[i]) return false
  }
  return true
}

function normalizeHost(input: string): string | null {
  let h = input.trim().toLowerCase()
  if (/^https?:\/\//.test(h)) {
    try {
      h = new URL(h).hostname
    } catch {
      return null
    }
  }
  h = h.replace(/\.$/, '')
  return HOST_RE.test(h) ? h : null
}

/** Validates untrusted input. Null/undefined/empty clears the blocklist. */
export function parseVisitorBlock(input: unknown): VisitorBlockParse {
  if (input === null || input === undefined) return { ok: true, block: null }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'visitorBlock must be an object or null' }
  const raw = input as Record<string, unknown>
  const ips = raw.cidrs ?? []
  const hosts = raw.referrerHosts ?? []
  if (!Array.isArray(ips) || !Array.isArray(hosts)) return { ok: false, error: 'visitorBlock.cidrs and referrerHosts must be arrays' }
  if (ips.length > MAX_BLOCK_ENTRIES || hosts.length > MAX_BLOCK_ENTRIES) {
    return { ok: false, error: `visitorBlock allows at most ${MAX_BLOCK_ENTRIES} entries per list` }
  }
  const cidrs = new Set<string>()
  for (const v of ips) {
    if (typeof v !== 'string') return { ok: false, error: 'visitorBlock.cidrs must contain strings' }
    const c = parseCidr(v)
    if (!c) return { ok: false, error: `Invalid IP or CIDR: ${String(v).slice(0, 64)}` }
    cidrs.add(c.canonical)
  }
  const refs = new Set<string>()
  for (const v of hosts) {
    if (typeof v !== 'string') return { ok: false, error: 'visitorBlock.referrerHosts must contain strings' }
    const wild = v.trim().startsWith('*.')
    const h = normalizeHost(wild ? v.trim().slice(2) : v)
    if (!h) return { ok: false, error: `Invalid referrer host: ${String(v).slice(0, 80)}` }
    refs.add(h)
  }
  if (cidrs.size === 0 && refs.size === 0) return { ok: true, block: null }
  return { ok: true, block: { cidrs: [...cidrs].sort(), referrerHosts: [...refs].sort() } }
}

const compiled = new WeakMap<VisitorBlock, ParsedCidr[]>()

function compile(block: VisitorBlock): ParsedCidr[] {
  let c = compiled.get(block)
  if (!c) {
    c = block.cidrs.map((s) => parseCidr(s)?.parsed).filter((x): x is ParsedCidr => !!x)
    compiled.set(block, c)
  }
  return c
}

export type BlockReason = 'ip' | 'referrer'

/** Returns why the visit is blocked, or null when it may proceed. */
export function evaluateVisitorBlock(
  block: VisitorBlock | null | undefined,
  visitor: { ip?: string | null; referer?: string | null },
): BlockReason | null {
  if (!block) return null
  if (visitor.ip && block.cidrs.length) {
    const bytes = ipToBytes(visitor.ip)
    if (bytes && compile(block).some((c) => inCidr(bytes, c))) return 'ip'
  }
  if (visitor.referer && block.referrerHosts.length) {
    let host: string | null = null
    try {
      host = new URL(visitor.referer).hostname.toLowerCase().replace(/\.$/, '')
    } catch {
      host = null
    }
    if (host && block.referrerHosts.some((r) => host === r || host!.endsWith(`.${r}`))) return 'referrer'
  }
  return null
}
