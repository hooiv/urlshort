import type { PrismaClient } from '@prisma/client'

/** One year, in minutes. */
export const MAX_LIFETIME_MINUTES = 525_600

/** Parse a user-supplied "expires N minutes after the first human click" value. Empty/null clears it. */
export function parseLifetimeMinutes(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null
  const value = typeof input === 'number' ? input : Number(String(input).trim())
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIFETIME_MINUTES) {
    throw new Error(`lifetimeMinutes must be an integer from 1 to ${MAX_LIFETIME_MINUTES}`)
  }
  return value
}

/** True once `now` is past firstClickAt + lifetime. */
export function isLifetimeElapsed(firstClickAt: Date, lifetimeMinutes: number, now: Date): boolean {
  return now.getTime() > firstClickAt.getTime() + lifetimeMinutes * 60_000
}

/**
 * Atomically start the lifetime clock (first caller wins) and return the
 * instant it started. One round trip, race-free: concurrent first clicks all
 * observe the same firstClickAt.
 */
export async function startLifetimeClock(
  db: Pick<PrismaClient, '$queryRaw'>,
  urlId: string,
  now: Date,
): Promise<Date | null> {
  const rows = await db.$queryRaw<{ firstClickAt: Date }[]>`
    UPDATE "urls" SET "firstClickAt" = COALESCE("firstClickAt", ${now})
    WHERE "id" = ${urlId} RETURNING "firstClickAt"`
  return rows[0]?.firstClickAt ?? null
}
