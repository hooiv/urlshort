import type { PrismaClient } from '@prisma/client'

export const MAX_DAILY_CLICK_CAP = 10_000_000

/** Parse a user-supplied daily cap. Empty/null clears the cap. */
export function parseDailyClickCap(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null
  const value = typeof input === 'number' ? input : Number(String(input).trim())
  if (!Number.isInteger(value) || value < 1 || value > MAX_DAILY_CLICK_CAP) {
    throw new Error(`Daily click cap must be an integer from 1 to ${MAX_DAILY_CLICK_CAP}`)
  }
  return value
}

/**
 * Atomically reserve one click against the link's per-UTC-day budget.
 * A single conditional UPDATE: it starts a fresh day at 1 when the stored day
 * differs, otherwise increments only while under the cap. Returns whether the
 * click was admitted.
 */
export async function reserveDailyClick(
  db: Pick<PrismaClient, '$executeRaw'>,
  urlId: string,
  cap: number,
  dateKey: string,
): Promise<boolean> {
  const rows = await db.$executeRaw`
    UPDATE "urls"
    SET "dailyClicksReserved" = CASE WHEN "dailyClicksDate" = ${dateKey} THEN "dailyClicksReserved" + 1 ELSE 1 END,
        "dailyClicksDate" = ${dateKey}
    WHERE "id" = ${urlId}
      AND ("dailyClicksDate" IS DISTINCT FROM ${dateKey} OR "dailyClicksReserved" < ${cap})`
  return rows === 1
}
