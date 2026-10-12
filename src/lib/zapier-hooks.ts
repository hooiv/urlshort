import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { visibleUrlWhere } from './folders'

/**
 * Zapier / Make / n8n compatible REST hooks.
 *
 * Zapier's "REST hook" contract: subscribe(target_url, event) -> {id},
 * unsubscribe(id), plus a polling `performList` used for sample data in the
 * editor and as the fallback when a hook is unavailable. Subscriptions are
 * ordinary webhook endpoints, so signing, SSRF checks, retries, the delivery
 * log and auto-disable all apply unchanged.
 */

export const ZAPIER_TRIGGERS = {
  new_link: { event: 'link.created', label: 'New link' },
  new_click: { event: 'link.clicked', label: 'New click' },
  new_sale: { event: 'conversion.recorded', label: 'New sale' },
} as const
export type ZapierTrigger = keyof typeof ZAPIER_TRIGGERS

export function isZapierTrigger(value: string): value is ZapierTrigger {
  return Object.prototype.hasOwnProperty.call(ZAPIER_TRIGGERS, value)
}

/** Maps a Zapier trigger key (or a raw webhook event name) to the webhook event. */
export function eventForTrigger(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const key = input.trim()
  if (isZapierTrigger(key)) return ZAPIER_TRIGGERS[key].event
  const known: string[] = Object.values(ZAPIER_TRIGGERS).map((t) => t.event)
  return known.includes(key) ? key : null
}

export const POLL_DEFAULT_LIMIT = 25
export const POLL_MAX_LIMIT = 100

export function parsePollLimit(raw: string | null): number {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n < 1) return POLL_DEFAULT_LIMIT
  return Math.min(Math.floor(n), POLL_MAX_LIMIT)
}

type LinkRow = { id: string; shortCode: string; originalUrl: string; title: string | null; createdAt: Date; workspaceId: string | null; folderId: string | null; tags?: string[] }

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
}

export function linkPayload(row: LinkRow) {
  const base = appUrl()
  return {
    id: row.id,
    shortCode: row.shortCode,
    shortUrl: base ? `${base}/${row.shortCode}` : `/${row.shortCode}`,
    originalUrl: row.originalUrl,
    title: row.title,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Newest first, as Zapier requires; ids are unique and stable so it can de-duplicate. */
export async function pollNewLinks(userId: string, limit: number) {
  const rows = await prisma.url.findMany({
    where: { AND: [visibleUrlWhere(userId), { deletedAt: null }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, shortCode: true, originalUrl: true, title: true, createdAt: true, workspaceId: true, folderId: true },
  })
  return rows.map(linkPayload)
}

export async function pollNewClicks(userId: string, limit: number) {
  const where: Prisma.ClickEventWhereInput = { trafficType: 'human', url: { AND: [visibleUrlWhere(userId), { deletedAt: null }] } }
  const rows = await prisma.clickEvent.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true, createdAt: true, country: true, city: true, deviceType: true, os: true, browser: true,
      referrerHost: true, utmSource: true, utmMedium: true, utmCampaign: true,
      url: { select: { shortCode: true, originalUrl: true } },
    },
  })
  // Raw IPs and user agents are deliberately not exposed to third-party automation tools.
  return rows.map((r) => ({
    id: r.id,
    shortCode: r.url.shortCode,
    originalUrl: r.url.originalUrl,
    country: r.country,
    city: r.city,
    deviceType: r.deviceType,
    os: r.os,
    browser: r.browser,
    referrerHost: r.referrerHost,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function pollNewSales(userId: string, limit: number) {
  const rows = await prisma.conversionEvent.findMany({
    where: { valueCents: { not: null }, url: { AND: [visibleUrlWhere(userId), { deletedAt: null }] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true, valueCents: true, currency: true, createdAt: true,
      goal: { select: { name: true } },
      url: { select: { shortCode: true } },
      commission: { select: { amountCents: true, status: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    shortCode: r.url.shortCode,
    goal: r.goal.name,
    valueCents: r.valueCents,
    currency: r.currency,
    commissionCents: r.commission?.amountCents ?? null,
    commissionStatus: r.commission?.status ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function pollTrigger(trigger: ZapierTrigger, userId: string, limit: number) {
  switch (trigger) {
    case 'new_link': return pollNewLinks(userId, limit)
    case 'new_click': return pollNewClicks(userId, limit)
    case 'new_sale': return pollNewSales(userId, limit)
  }
}
