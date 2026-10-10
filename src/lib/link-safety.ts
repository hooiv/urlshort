import { isIP } from 'node:net'

export type RiskAssessment = {
  status: 'cleared' | 'review'
  reason: string | null
}

const SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'bl.ink', 'lnkd.in', 'dub.sh', 'short.io', 'v.gd', 'adf.ly', 't.ly', 'qr.ae', 'urlz.fr'])
const RISKY_TLDS = new Set(['zip', 'mov', 'top', 'xyz', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'work', 'support'])
const BRANDS = ['paypal', 'microsoft', 'apple', 'google', 'amazon', 'netflix', 'facebook', 'instagram', 'binance', 'coinbase', 'metamask', 'dropbox', 'docusign']

/** Fold common look-alike characters so `paypa1`/`g00gle` compare as the brand. */
function foldLookalikes(label: string): string {
  return label.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/\$/g, 's')
}

/** Brand impersonation: a brand name inside a hostname that is not the brand's own registrable domain. */
export function detectBrandImpersonation(host: string): string | null {
  const labels = host.replace(/\.$/, '').split('.')
  if (labels.length < 2) return null
  // Registrable label sits before `.com` or a country suffix (`.de`, `.co.uk`, `.com.au`).
  const suffixLen = /^(?:co|com|org|net)$/.test(labels[labels.length - 2] ?? '') && /^[a-z]{2}$/.test(labels[labels.length - 1]) && labels.length >= 3 ? 2 : 1
  const registrableLabel = labels[labels.length - 1 - suffixLen]
  const ownTld = suffixLen === 2 || labels[labels.length - 1] === 'com' || /^[a-z]{2}$/.test(labels[labels.length - 1])
  for (const brand of BRANDS) {
    if (registrableLabel === brand && ownTld) continue
    if (labels.slice(0, labels.length - suffixLen).some((l) => l.includes(brand) || foldLookalikes(l).includes(brand))) return brand
  }
  return null
}

const REDIRECT_PARAMS = new Set(['url', 'u', 'redirect', 'redirect_uri', 'redirect_url', 'redir', 'return', 'returnurl', 'return_to', 'next', 'continue', 'dest', 'destination', 'goto', 'target', 'link', 'q'])

/** Query parameter that carries another absolute http(s) URL on a different host: a classic open-redirect hop. */
export function detectEmbeddedRedirect(url: URL): string | null {
  for (const [key, value] of url.searchParams) {
    if (!REDIRECT_PARAMS.has(key.toLowerCase())) continue
    try {
      const inner = new URL(value)
      if ((inner.protocol === 'http:' || inner.protocol === 'https:') && inner.hostname.toLowerCase() !== url.hostname.toLowerCase()) return key
    } catch { /* not an absolute URL */ }
  }
  return null
}

export function assessDestination(rawUrl: string): RiskAssessment {
  let url: URL
  try { url = new URL(rawUrl) } catch { return { status: 'review', reason: 'Destination URL could not be parsed' } }
  // Allowlist: only http(s) destinations are assessable. Anything else
  // (javascript:, data:, file:, ftp:, …) must never clear silently.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { status: 'review', reason: 'Non-HTTP(S) destination protocol' }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
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

  // WHATWG URL normalizes 0x7f.1 / 2130706433 to dotted quads, so isIP catches
  // those; what remains is a numeric-only final label (e.g. 10.0.0.1.example is fine,
  // but a bare all-digit host that survived is not).
  if (!isIP(host) && /^[\d.]+$/.test(host)) reasons.push('Numeric-only hostname')
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname + url.search)) reasons.push('Control characters encoded in the URL')
  if (url.port && !isIP(host)) reasons.push('Non-standard port on a public hostname')
  if (/(?:\.jar|\.vbs|\.ps1|\.bat|\.cmd|\.lnk|\.hta)(?:$|[?#/])/i.test(url.pathname + url.search + url.hash)) reasons.push('Script or launcher file destination')
  if (detectEmbeddedRedirect(url)) reasons.push('Destination forwards to another site via a redirect parameter')
  if (SHORTENER_HOSTS.has(host) || SHORTENER_HOSTS.has(host.replace(/^www\./, ''))) reasons.push('Chained link-shortener destination')
  const tld = host.split('.').pop() ?? ''
  if (!isIP(host) && RISKY_TLDS.has(tld)) reasons.push('High-abuse top-level domain')
  const brand = detectBrandImpersonation(host)
  if (brand) reasons.push(`Possible ${brand} impersonation`)
  if ((host.match(/-/g) ?? []).length >= 4) reasons.push('Excessively hyphenated hostname')

  return reasons.length ? { status: 'review', reason: reasons.join('; ') } : { status: 'cleared', reason: null }
}
