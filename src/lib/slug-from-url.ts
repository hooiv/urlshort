import { isReservedCode } from '@/lib/utils'

/**
 * Deterministic, readable short-code suggestions derived from a destination
 * URL (host brand + meaningful path words). No network, no randomness.
 */
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const NOISE = new Set([
  'www', 'com', 'net', 'org', 'io', 'co', 'html', 'htm', 'php', 'aspx', 'index', 'home', 'en', 'us', 'uk',
  'the', 'and', 'for', 'of', 'to', 'a', 'in', 'on', 'with', 'blog', 'p', 'pages', 'page', 'amp',
])
const MAX_WORDS = 3
const MAX_LEN = 24

function words(input: string): string[] {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !NOISE.has(w) && !/^\d{5,}$/.test(w))
}

function brandOf(host: string): string | null {
  const labels = host.toLowerCase().replace(/^www\./, '').split('.')
  // second-level label, skipping common two-part TLDs such as co.uk
  const sld = labels.length >= 3 && labels[labels.length - 2].length <= 3 ? labels[labels.length - 3] : labels[labels.length - 2] ?? labels[0]
  const w = words(sld)
  return w[0] ?? null
}

export function suggestSlugsFromUrl(rawUrl: string, limit = 6): string[] {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return []
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return []
  const brand = brandOf(url.hostname)
  const pathWords = words(safeDecode(url.pathname))
  const tail = words(safeDecode(url.pathname.split('/').filter(Boolean).pop() ?? ''))
  const out: string[] = []
  const add = (c: string) => {
    const s = c.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, MAX_LEN).replace(/-$/, '')
    if (s.length >= 3 && CODE_RE.test(s) && !isReservedCode(s) && !out.includes(s)) out.push(s)
  }
  if (tail.length) add(tail.slice(0, MAX_WORDS).join('-'))
  if (brand && tail.length) add(`${brand}-${tail[0]}`)
  if (pathWords.length > 1) add(pathWords.slice(0, 2).join('-'))
  if (brand && pathWords.length) add(`${brand}-${pathWords[pathWords.length - 1]}`)
  if (tail.length > 1) add(tail.slice(0, 2).join('-'))
  if (brand) add(brand)
  return out.slice(0, limit)
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
