import { isIP } from 'node:net'

export type RiskAssessment = {
  status: 'cleared' | 'review'
  reason: string | null
}

export function assessDestination(rawUrl: string): RiskAssessment {
  let url: URL
  try { url = new URL(rawUrl) } catch { return { status: 'review', reason: 'Destination URL could not be parsed' } }
  const host = url.hostname.toLowerCase()
  const reasons: string[] = []

  if (isIP(host)) reasons.push('Direct IP-address destination')
  if (host.startsWith('xn--') || host.includes('.xn--')) reasons.push('Internationalized/punycode hostname')
  if (url.protocol === 'http:') reasons.push('Unencrypted HTTP destination')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) reasons.push('Private/local hostname')
  if (/(?:^|\/)(?:login|signin|verify|wallet|password|reset|unlock)(?:\/|$)/i.test(url.pathname)) reasons.push('Authentication-sensitive path')
  if (/(?:\.exe|\.scr|\.msi|\.apk|\.dmg|\.iso)(?:$|\?)/i.test(url.pathname)) reasons.push('Executable file destination')

  return reasons.length ? { status: 'review', reason: reasons.join('; ') } : { status: 'cleared', reason: null }
}
