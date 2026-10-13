import { prisma } from '@/lib/prisma'
import { assessDestination } from '@/lib/link-safety'

/**
 * Per-domain fallbacks (Dub "root domain redirect" / Short.io "404 redirect").
 * rootRedirectUrl: where the bare branded domain (`go.acme.com/`) sends visitors.
 * notFoundUrl: where unknown/inactive paths on that domain go instead of QuickLink's 404.
 */
export type DomainSettingsPatch = { rootRedirectUrl?: string | null; notFoundUrl?: string | null }
export type DomainSettingsResult = { ok: true; value: DomainSettingsPatch } | { ok: false; error: string }

const FIELDS = ['rootRedirectUrl', 'notFoundUrl'] as const

function checkUrl(field: string, raw: unknown, host: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: `${field} must be a URL string or null` }
  const text = raw.trim()
  if (text.length > 2048) return { ok: false, error: `${field} is too long` }
  let url: URL
  try { url = new URL(text) } catch { return { ok: false, error: `${field} must be an absolute http(s) URL` } }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: `${field} must be an http(s) URL` }
  if (url.username || url.password) return { ok: false, error: `${field} must not contain credentials` }
  // A fallback pointing back at the same domain would loop forever.
  if (url.hostname.toLowerCase().replace(/^www\./, '') === host.toLowerCase().replace(/^www\./, '')) return { ok: false, error: `${field} cannot point at the same domain (redirect loop)` }
  const risk = assessDestination(url.toString())
  if (risk.status !== 'cleared') return { ok: false, error: `${field} was flagged: ${risk.reason ?? 'unsafe destination'}` }
  return { ok: true, value: url.toString() }
}

export function validateDomainSettings(body: unknown, host: string): DomainSettingsResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Body must be a JSON object' }
  const record = body as Record<string, unknown>
  const unknown = Object.keys(record).filter((key) => !(FIELDS as readonly string[]).includes(key))
  if (unknown.length) return { ok: false, error: `Unknown field: ${unknown[0]}` }
  const value: DomainSettingsPatch = {}
  for (const field of FIELDS) {
    if (!(field in record)) continue
    const checked = checkUrl(field, record[field], host)
    if (!checked.ok) return checked
    value[field] = checked.value
  }
  if (!Object.keys(value).length) return { ok: false, error: 'Provide rootRedirectUrl and/or notFoundUrl' }
  return { ok: true, value }
}

export async function getDomainFallbacks(host: string) {
  return prisma.brandedDomain.findFirst({ where: { host, status: 'verified' }, select: { id: true, rootRedirectUrl: true, notFoundUrl: true } })
}

export async function updateDomainFallbacks(domainId: string, patch: DomainSettingsPatch) {
  return prisma.brandedDomain.update({ where: { id: domainId }, data: patch, select: { host: true, rootRedirectUrl: true, notFoundUrl: true } })
}
