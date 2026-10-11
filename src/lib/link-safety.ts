import { isIP } from 'node:net'
import { domainToUnicode } from 'node:url'

export type RiskAssessment = {
  status: 'cleared' | 'review'
  reason: string | null
}

const SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'bl.ink', 'lnkd.in', 'dub.sh', 'short.io', 'v.gd', 'adf.ly', 't.ly', 'qr.ae', 'urlz.fr'])
const RISKY_TLDS = new Set(['zip', 'mov', 'top', 'xyz', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'work', 'support'])
const TUNNEL_SUFFIXES = ['duckdns.org', 'ngrok.io', 'ngrok-free.app', 'ngrok.app', 'trycloudflare.com', 'loca.lt', 'serveo.net', 'no-ip.org', 'ddns.net', 'hopto.org', 'zapto.org']
const FREE_HOSTING_SUFFIXES = ['weebly.com', 'wixsite.com', '000webhostapp.com', 'glitch.me', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev', 'netlify.app', 'herokuapp.com', 'blogspot.com']
const BRANDS = ['paypal', 'microsoft', 'apple', 'google', 'amazon', 'netflix', 'facebook', 'instagram', 'binance', 'coinbase', 'metamask', 'dropbox', 'docusign', 'chase', 'wellsfargo', 'linkedin', 'whatsapp', 'telegram', 'steam', 'adobe', 'outlook', 'icloud']

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

/** Query/fragment values that smuggle an executable scheme for a downstream open-redirect or XSS sink. */
export function hasScriptSchemeParam(url: URL): boolean {
  const scheme = /^\s*(?:javascript|vbscript|data):/i
  for (const [, value] of url.searchParams) if (scheme.test(value)) return true
  return false
}

function decodeURIComponentSafe(v: string): string {
  try { return decodeURIComponent(v) } catch { return v }
}

/** True when a path segment or query value is base64 that decodes to an http(s) URL (a common redirect-hiding trick). */
function hasBase64Url(url: URL): boolean {
  const tokens = [...url.pathname.split('/'), ...[...url.searchParams.values()]]
  return tokens.some((t) => {
    if (t.length < 16 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(t)) return false
    try { return /^https?:\/\//i.test(Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return false }
  })
}

/** True when over half of a 24+ char path is %XX escapes: legitimate URLs rarely encode that much. */
function isHeavilyPercentEncoded(path: string): boolean {
  if (path.length < 24) return false
  const escapes = (path.match(/%[0-9a-f]{2}/gi) ?? []).length
  return escapes * 3 / path.length > 0.5
}

/** Extensions that launch code or load payloads directly when opened. One entry per line keeps diffs reviewable. */
export const LAUNCHER_EXTENSIONS = [
  'accde',
  'accdr',
  'ade',
  'adp',
  'apk',
  'appimage',
  'appinstaller',
  'application',
  'appref-ms',
  'appx',
  'appxbundle',
  'bat',
  'cab',
  'cdxml',
  'chm',
  'cmd',
  'cpl',
  'crx',
  'diagcab',
  'dll',
  'dmg',
  'drv',
  'gadget',
  'hta',
  'img',
  'inf',
  'iqy',
  'iso',
  'jar',
  'jnlp',
  'jse',
  'library-ms',
  'lnk',
  'mam',
  'mde',
  'mht',
  'mhtml',
  'msc',
  'msh',
  'msh1',
  'msi',
  'msix',
  'msixbundle',
  'msm',
  'msp',
  'mst',
  'msu',
  'ocx',
  'one',
  'pif',
  'pkg',
  'ps1',
  'ps1xml',
  'ps2',
  'ps2xml',
  'psc1',
  'psc2',
  'psd1',
  'psm1',
  'psrc',
  'pssc',
  'pyz',
  'pyzw',
  'rdp',
  'reg',
  'scf',
  'scr',
  'sct',
  'searchconnector-ms',
  'settingcontent-ms',
  'shb',
  'shs',
  'slk',
  'sys',
  'themepack',
  'url',
  'vba',
  'vbe',
  'vbs',
  'vbscript',
  'vhd',
  'vhdx',
  'vsix',
  'vsto',
  'wll',
  'ws',
  'wsc',
  'wsf',
  'wsh',
  'xbap',
  'xll',
  'xnk',
  'xpi',
  'xsl',
] as const
const LAUNCHER_EXT_RE = new RegExp(`\\.(?:${LAUNCHER_EXTENSIONS.join('|')})(?:$|[?#/;])`, 'i')

/** Path with percent-escapes decoded, so `setup%2Eexe` and `setup.%65xe` are judged as `setup.exe`. Falls back to the raw path on malformed escapes. */
function decodedPath(url: URL): string {
  let p = url.pathname
  for (let i = 0; i < 2; i++) { try { const d = decodeURIComponent(p); if (d === p) break; p = d } catch { break } }
  return p
}

export function assessDestination(rawUrl: string): RiskAssessment {
  let url: URL
  try { url = new URL(rawUrl) } catch { return { status: 'review', reason: 'Destination URL could not be parsed' } }
  // Allowlist: only http(s) destinations are assessable. Anything else
  // (javascript:, data:, file:, ftp:, …) must never clear silently.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { status: 'review', reason: 'Non-HTTP(S) destination protocol' }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  const reasons: string[] = []
  const scanPath = decodedPath(url)

  if (url.username || url.password) reasons.push('Credential-bearing destination')
  if (isIP(host)) reasons.push('Direct IP-address destination')
  if (host.startsWith('xn--') || host.includes('.xn--')) reasons.push('Internationalized/punycode hostname')
  if (url.protocol === 'http:') reasons.push('Unencrypted HTTP destination')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) reasons.push('Private/local hostname')
  if (/(?:^|\/)(?:login|signin|verify|wallet|password|reset|unlock)(?:\/|$)/i.test(url.pathname)) reasons.push('Authentication-sensitive path')
  // Match against path + query + fragment: `new URL` strips `?…`/`#…` from
  // `pathname`, so `evil.exe?x=1`, `evil.exe#run`, and `evil.exe/` would
  // otherwise score as clean.
  if (/(?:\.exe|\.scr|\.msi|\.apk|\.dmg|\.iso)(?:$|[?#/;])/i.test(scanPath + url.search + url.hash)) reasons.push('Executable file destination')

  // WHATWG URL normalizes 0x7f.1 / 2130706433 to dotted quads, so isIP catches
  // those; what remains is a numeric-only final label (e.g. 10.0.0.1.example is fine,
  // but a bare all-digit host that survived is not).
  if (!isIP(host) && /^[\d.]+$/.test(host)) reasons.push('Numeric-only hostname')
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname + url.search)) reasons.push('Control characters encoded in the URL')
  if (url.port && !isIP(host)) reasons.push('Non-standard port on a public hostname')
  if (LAUNCHER_EXT_RE.test(scanPath + url.search + url.hash)) reasons.push('Script or launcher file destination')
  if (/%25(?:2[0-9a-f]|3[a-f]|5[c-f]|0[0-9a-f])/i.test(url.pathname + url.search)) reasons.push('Double-encoded characters in the URL')
  if (/(?:\.zip|\.rar|\.7z|\.docm|\.xlsm)(?:$|[?#/;])/i.test(url.pathname)) reasons.push('Archive or macro-document download destination')
  if (detectEmbeddedRedirect(url)) reasons.push('Destination forwards to another site via a redirect parameter')
  if (SHORTENER_HOSTS.has(host) || SHORTENER_HOSTS.has(host.replace(/^www\./, ''))) reasons.push('Chained link-shortener destination')
  if (host.split('.').length >= 7) reasons.push('Unusually deep subdomain chain')
  if (hasScriptSchemeParam(url)) reasons.push('Query parameter carries a javascript:/data: payload')
  if (/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/.test(decodeURIComponentSafe(rawUrl))) reasons.push('Invisible or bidirectional-control characters in the URL')
  if (/%E2%80%AE|\u202e/i.test(url.pathname + url.search)) reasons.push('Right-to-left override in file name')
  if (/\.(?:pdf|docx?|xlsx?|pptx?|jpe?g|png|txt|mp4)\.(?:exe|scr|msi|apk|bat|cmd|js|jar|vbs|ps1|lnk|hta)(?:$|[?#/;])/i.test(scanPath)) reasons.push('Double-extension file masquerading as a document')
  if (/^#?\/*(?:https?:)?\/\/[^/]+\.[a-z]{2,}/i.test(url.hash) || /^#.*https?%3a/i.test(url.hash)) reasons.push('URL fragment mimics another destination')
  if (/(?:\.msix|\.msixbundle|\.appx|\.appinstaller|\.pkg|\.deb|\.rpm|\.jnlp|\.reg|\.dll)(?:$|[?#/;])/i.test(scanPath + url.search + url.hash)) reasons.push('Installer or system-package file destination')
  if (/^(?:metadata\.google\.internal|metadata\.goog|instance-data(?:\.ec2\.internal)?|169\.254\.169\.254|100\.100\.100\.200|\[?fd00:ec2::254\]?)$/.test(host)) reasons.push('Cloud instance-metadata endpoint destination')
  if (/\.(?:iso|img|vhd|vhdx|dmg)(?:$|[?#/;])/i.test(scanPath)) reasons.push('Disk-image download destination')
  if (/\.(?:docm|wll|application|xlsm|pptm|dotm|xlam|ppam|xltm|potm|ppsm|sldm|wsf|vbs|vbe|hta|scr|lnk|jse|wsh|wsc|cpl|msc|pif|gadget)(?:$|[?#/;])/i.test(url.pathname)) reasons.push('Macro-enabled document or script-file destination')
  if (TUNNEL_SUFFIXES.some((t) => host === t || host.endsWith(`.${t}`))) reasons.push('Temporary tunnel or dynamic-DNS hostname')
  if (BRANDS.some((b) => FREE_HOSTING_SUFFIXES.some((f) => host.endsWith(`.${f}`) && host.slice(0, -f.length - 1).split('.').some((l) => l.includes(b))))) reasons.push('Brand name on a free-hosting subdomain (possible phishing page)')
  if (/(^|\.)(ipfs\.io|dweb\.link|cloudflare-ipfs\.com|w3s\.link|nftstorage\.link)$/.test(host) && BRANDS.some((b) => url.pathname.toLowerCase().includes(b))) reasons.push('Brand name in IPFS-hosted page (possible phishing page)')
  if (/^[^.]+\.(?:s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com|blob\.core\.windows\.net|storage\.googleapis\.com)$/.test(host) && BRANDS.some((b) => host.split('.')[0].includes(b))) reasons.push('Brand name in a cloud-storage bucket hostname (possible phishing page)')
  if (/\.(?:pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|csv|rtf|mp3|mp4|zip)\.(?:exe|scr|bat|cmd|com|msi|js|vbs|jar|lnk|hta|ps1|pif|wsf|jse|vbe|chm|msc|cpl|reg|msp|appx|msix|iso)(?:$|[?#/;])/i.test(scanPath)) reasons.push('Double-extension file disguise')
  if (/^https?:(?:\\\\|\/\\|\\\/)/i.test(rawUrl.trim()) || /^https?:\/\/[^/?#]*\\/i.test(rawUrl.trim())) reasons.push('Backslash in the authority (parser-confusion host spoofing)')
  if (/%(?:40|2f|5c|23|3f)/i.test(url.username) || /%(?:40|2f|5c)/i.test(url.password)) reasons.push('Encoded delimiter in credentials (host-spoofing trick)')
  if (/\.(?:search-ms|searchconnector-ms|library-ms|url|website|scf|pif|gadget|cpl|chm|one)(?:$|[?#/;])/i.test(url.pathname)) reasons.push('Windows shortcut or search-connector file destination')
  if (isIP(host) && /^https?:\/\/(?:[^/?#@]*@)?(?!\d{1,3}(?:\.\d{1,3}){3}(?:[:/?#]|$))[0-9a-fx.]+(?:[:/?#]|$)/i.test(rawUrl.trim())) reasons.push('Obfuscated IP address (hex, octal or integer form)')
  if (isPrivateIp(host)) reasons.push('Private, loopback or link-local IP address destination')
  if (hasBase64Url(url)) reasons.push('Base64-encoded URL hidden in the destination')
  if (/[\u2024\u2044\u2215\u29F8\uFF0E\uFF0F\u3002]/.test(decodeURIComponentSafe(rawUrl))) reasons.push('Lookalike dot or slash characters in the URL')
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(decodeURIComponentSafe(url.username))) reasons.push('Hostname-lookalike in credentials (userinfo spoofing)')
  if (isHeavilyPercentEncoded(url.pathname)) reasons.push('Heavily percent-encoded path (obfuscation)')
  if (/\.(?:xll|iqy|slk|wsh|jse|ws|msc|application|gadget|settingcontent-ms|appref-ms|jnlp|pif|ps1xml|psc1|cmd|vbe|wsf|wsc|scr|cpl|hta)(?:$|[?#/;])/i.test(url.pathname)) reasons.push('Office add-in or legacy script-host file destination')
  if (url.href.length > 2000) reasons.push('Unusually long URL')
  if (/\.\.|\.$/.test(url.hostname)) reasons.push('Malformed hostname (trailing or empty label)')
  if (hasMixedScriptLabel(rawHostUnicode(url.hostname))) reasons.push('Mixed-script hostname label (possible homoglyph spoofing)')
  const spoofed = detectWholeScriptSpoof(rawHostUnicode(url.hostname))
  if (spoofed) reasons.push(`Non-Latin lookalike of ${spoofed} (homoglyph spoofing)`)
  const accented = detectAccentedBrandSpoof(rawHostUnicode(url.hostname))
  if (accented) reasons.push(`Accented lookalike of ${accented} (homoglyph spoofing)`)
  const tld = host.split('.').pop() ?? ''
  if (!isIP(host) && RISKY_TLDS.has(tld)) reasons.push('High-abuse top-level domain')
  const brand = detectBrandImpersonation(host)
  if (brand) reasons.push(`Possible ${brand} impersonation`)
  if ((host.match(/-/g) ?? []).length >= 4) reasons.push('Excessively hyphenated hostname')

  return reasons.length ? { status: 'review', reason: reasons.join('; ') } : { status: 'cleared', reason: null }
}

/** Loopback, RFC1918, CGNAT, link-local and IPv6 loopback/ULA/link-local addresses: never a legitimate public destination. */
export function isPrivateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '')
  const kind = isIP(h)
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  if (kind === 6) {
    const l = h.toLowerCase()
    if (l === '::1' || l === '::') return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l)
    if (mapped) return isPrivateIp(mapped[1])
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(l)
    if (hex) { const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16); return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`) }
    return /^f[cd][0-9a-f]{2}:/.test(l) || /^fe[89ab][0-9a-f]:/.test(l)
  }
  return false
}

function rawHostUnicode(hostname: string): string {
  try { return domainToUnicode(hostname) || hostname } catch { return hostname }
}

/** True when a single DNS label mixes Latin with Cyrillic or Greek letters. */
export function hasMixedScriptLabel(unicodeHost: string): boolean {
  return unicodeHost.split('.').some((label) =>
    /\p{Script=Latin}/u.test(label) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(label))
}

const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l', 'һ': 'h', 'ԛ': 'q', 'ԝ': 'w',
  'ο': 'o', 'ν': 'v', 'α': 'a', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u',
}

/**
 * A label written entirely in Cyrillic/Greek letters that, once confusables
 * are folded to Latin, spells a protected brand. Mixed-script labels are
 * caught separately; this covers the "whole-script" spoof (e.g. "арр1е").
 */
export function detectWholeScriptSpoof(unicodeHost: string): string | null {
  for (const label of unicodeHost.split('.')) {
    if (!/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(label) || /\p{Script=Latin}/u.test(label)) continue
    const folded = [...label.toLowerCase()].map((c) => CONFUSABLES[c] ?? c).join('')
    const hit = BRANDS.find((b) => folded.includes(b))
    if (hit) return hit
  }
  return null
}

/**
 * A Latin-script label that only spells a protected brand once diacritics and
 * dotless/stroked letters are folded away (e.g. "paypál", "gооgle" is caught
 * elsewhere; "ıinkedin" and "amazøn" here). Plain ASCII labels never match.
 */
export function detectAccentedBrandSpoof(unicodeHost: string): string | null {
  const LATIN_FOLD: Record<string, string> = { 'ı': 'i', 'ø': 'o', 'đ': 'd', 'ł': 'l', 'ħ': 'h', 'ŧ': 't', 'ß': 's' }
  for (const label of unicodeHost.split('.')) {
    if (/^[\x00-\x7f]*$/.test(label) || /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(label)) continue
    const folded = [...label.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()].map((c) => LATIN_FOLD[c] ?? c).join('')
    const hit = BRANDS.find((b) => folded.includes(b))
    if (hit) return hit
  }
  return null
}
