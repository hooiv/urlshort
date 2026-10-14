import { isIP } from 'node:net'

export const MAX_ALLOWLIST_ENTRIES = 20

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.')
  if (p.length !== 4) return null
  let n = 0
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null
    const v = Number(part)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

function ipv6ToBigInt(ip: string): bigint | null {
  let addr = ip.split('%')[0].toLowerCase()
  const mapped = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) {
    const v4 = ipv4ToInt(mapped[2])
    if (v4 === null) return null
    addr = mapped[1] + ((v4 >>> 16) & 0xffff).toString(16) + ':' + (v4 & 0xffff).toString(16)
  }
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...tail]
  let n = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return n
}

type Rule = { family: 4 | 6; base: bigint; bits: number }

/** Parse "1.2.3.4", "10.0.0.0/8", "2001:db8::/32". Returns null when invalid. */
export function parseCidr(input: string): Rule | null {
  const text = input.trim()
  const [addr, len, extra] = text.split('/')
  if (!addr || extra !== undefined) return null
  const family = isIP(addr)
  if (!family) return null
  const max = family === 4 ? 32 : 128
  let bits = max
  if (len !== undefined) {
    if (!/^\d{1,3}$/.test(len)) return null
    bits = Number(len)
    if (bits > max) return null
  }
  const value = family === 4 ? BigInt(ipv4ToInt(addr)!) : ipv6ToBigInt(addr)
  if (value === null) return null
  const shift = BigInt(max - bits)
  return { family: family as 4 | 6, base: (value >> shift) << shift, bits }
}

/** Validate user input into a normalised, de-duplicated list; null on any bad entry. */
export function parseAllowlist(value: unknown): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_ALLOWLIST_ENTRIES) return null
  const out = new Set<string>()
  for (const v of value) {
    if (typeof v !== 'string' || !parseCidr(v)) return null
    out.add(v.trim().toLowerCase())
  }
  return [...out]
}

/** True when the list is empty (no restriction) or the IP falls inside any entry. */
export function ipAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (!allowlist.length) return true
  let family = isIP(ip.trim())
  let value: bigint | null = null
  let candidate = ip.trim()
  const v4mapped = candidate.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4mapped) { candidate = v4mapped[1]; family = 4 }
  if (!family) return false
  value = family === 4 ? BigInt(ipv4ToInt(candidate)!) : ipv6ToBigInt(candidate)
  if (value === null) return false
  const max = family === 4 ? 32 : 128
  return allowlist.some((entry) => {
    const rule = parseCidr(entry)
    if (!rule || rule.family !== family) return false
    const shift = BigInt(max - rule.bits)
    return (value! >> shift) << shift === rule.base
  })
}
