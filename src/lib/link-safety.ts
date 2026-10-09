import { isIP } from 'node:net'

export type RiskAssessment = {
  status: 'cleared' | 'review'
  reason: string | null
}

const SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy'])
const RISKY_TLDS = new Set(['zip', 'mov', 'top', 'xyz', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'work', 'support'])
const BRANDS = ['paypal', 'microsoft', 'apple', 'google', 'amazon', 'netflix', 'facebook', 'instagram', 'binance', 'coinbase', 'metamask', 'dropbox', 'docusign']

/** Fold common look-alike characters so `paypa1`/`g00gle` compare as the brand. */
function foldLookalikes(label: string): string {
  return label.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/\$/g, 's')
}

/** Brand impersonation: a brand name inside a hostname that is not the brand's own registrable domain. */
export function detectBrandImpersonation(host: string): string | null {
  const labels = host.split('.')
  if (labels.length < 2) return null
  const registrable = labels.slice(-2).join('.')
  for (const brand of BRANDS) {
    if (registrable === `${brand}.com`) continue
    if (labels.slice(0, -1).some((l) => l.includes(brand) || foldLookalikes(l).includes(brand))) return brand
  }
  return null
}

export function assessDestination(rawUrl: string): RiskAssessment {
  let url: URL
  try { url = new URL(rawUrl) } catch { return { status: 'review', reason: 'Destination URL could not be parsed' } }
  // Allowlist: only http(s) destinations are assessable. Anything else
  // (javascript:, data:, file:, ftp:, …) must never clear silently.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { status: 'review', reason: 'Non-HTTP(S) destination protocol' }
  const host = url.hostname.toLowerCase()
  const reasons: string[] = []

  if (url.username || url.password) reasons.push('Credential-bearing destination')
  if (isIP(host)) reasons.push('Direct IP-address destination')
  if (host.startsWith('xn--') || host.includes('.xn--')) reasons.push('Internationalized/punycode hostname')
  if (url.protocol === 'http:') reasons.push('Unencrypted HTTP destination')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) reasons.push('Private/local hostname')
  if (/(?:^|\/)(?:login|signin|verify|wallet|password|reset|unlock)(?:\/|$)/i.test(url.pathname)) reasons.push('Authentication-sensitive path')
  // Match against path + query + fragment: `new URL` strips `?…`/`#…` from
  // `pathname`, so `evil.exe?x=1`, `evil.exe#run`, and `evil.exe/` would
  // otherwise score as clean.
  if (/(?:\.exe|\.scr|\.msi|\.apk|\.dmg|\.iso)(?:$|[?#/])/i.test(url.pathname + url.search + url.hash)) reasons.push('Executable file destination')

  if (SHORTENER_HOSTS.has(host)) reasons.push('Chained link-shortener destination')
  const tld = host.split('.').pop() ?? ''
  if (!isIP(host) && RISKY_TLDS.has(tld)) reasons.push('High-abuse top-level domain')
  const brand = detectBrandImpersonation(host)
  if (brand) reasons.push(`Possible ${brand} impersonation`)
  if ((host.match(/-/g) ?? []).length >= 4) reasons.push('Excessively hyphenated hostname')

  return reasons.length ? { status: 'review', reason: reasons.join('; ') } : { status: 'cleared', reason: null }
}
