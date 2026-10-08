import { prisma } from './prisma'

/**
 * Resolves short codes to link ids the user owns. Endpoints are user-scoped and
 * fan-out only reaches links of the same owner, so accepting a code the user
 * does not own would be both a silent no-op and an enumeration oracle; reject
 * it with the same message whether it is missing or foreign.
 */
export async function resolveOwnedLinkIds(
  userId: string,
  shortCodes: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  if (shortCodes.length === 0) return { ok: true, ids: [] }
  const rows = await prisma.url.findMany({
    where: { shortCode: { in: shortCodes }, userId, deletedAt: null },
    select: { id: true, shortCode: true },
  })
  const found = new Set(rows.map(row => row.shortCode))
  const missing = shortCodes.filter(code => !found.has(code))
  if (missing.length > 0) {
    const preview = missing.slice(0, 5).join(', ')
    return { ok: false, error: `Unknown short code${missing.length > 1 ? 's' : ''}: ${preview}${missing.length > 5 ? ', …' : ''}` }
  }
  return { ok: true, ids: rows.map(row => row.id) }
}
