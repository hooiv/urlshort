import { prisma } from '@/lib/prisma'

/**
 * Extend (or reactivate) a link's expiry. Extends from the later of the current
 * expiry and now, so an already-expired link gets a full fresh window.
 */
export const MAX_EXTEND_DAYS = 3650
export const MAX_EXTEND_CLICKS = 1_000_000_000

export type ExtendInput =
  | { ok: true; days: number | null; addClicks: number | null }
  | { ok: false; error: string }

export function validateExtend(body: { days?: unknown; addClicks?: unknown }): ExtendInput {
  const { days, addClicks } = body
  if (days === undefined && addClicks === undefined) return { ok: false, error: 'Provide days and/or addClicks' }
  let d: number | null = null
  let c: number | null = null
  if (days !== undefined) {
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_EXTEND_DAYS) {
      return { ok: false, error: `days must be an integer between 1 and ${MAX_EXTEND_DAYS}` }
    }
    d = days
  }
  if (addClicks !== undefined) {
    if (typeof addClicks !== 'number' || !Number.isInteger(addClicks) || addClicks < 1 || addClicks > MAX_EXTEND_CLICKS) {
      return { ok: false, error: `addClicks must be an integer between 1 and ${MAX_EXTEND_CLICKS}` }
    }
    c = addClicks
  }
  return { ok: true, days: d, addClicks: c }
}

export function computeExtendedExpiry(current: Date | null, days: number, now: Date = new Date()): Date {
  const base = current && current.getTime() > now.getTime() ? current : now
  return new Date(base.getTime() + days * 86_400_000)
}

export function computeExtendedMaxClicks(current: number | null, add: number): number | null {
  // An unlimited link stays unlimited; adding a cap would silently restrict it.
  if (current === null) return null
  return Math.min(current + add, MAX_EXTEND_CLICKS)
}

export async function extendLink(
  urlId: string,
  current: { expiresAt: Date | null; maxClicks: number | null },
  input: { days: number | null; addClicks: number | null },
  now: Date = new Date(),
) {
  const data: { expiresAt?: Date; maxClicks?: number | null } = {}
  if (input.days !== null) data.expiresAt = computeExtendedExpiry(current.expiresAt, input.days, now)
  if (input.addClicks !== null) data.maxClicks = computeExtendedMaxClicks(current.maxClicks, input.addClicks)
  return prisma.url.update({ where: { id: urlId }, data, select: { id: true, shortCode: true, expiresAt: true, maxClicks: true } })
}
