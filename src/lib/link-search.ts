import type { Prisma } from '@prisma/client'

export const MAX_SEARCH_LENGTH = 200

/** Normalise a user search string: trim, collapse whitespace, cap length. */
export function normalizeSearch(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH)
}

/**
 * Where-clause for the links table search box. Matches short code, title,
 * destination URL and private notes (case-insensitive substring), plus links
 * carrying a tag equal to the query (tags are stored lowercase).
 */
export function buildLinkSearchWhere(raw: string | null | undefined): Prisma.UrlWhereInput | null {
  const search = normalizeSearch(raw)
  if (!search) return null
  const contains = { contains: search, mode: 'insensitive' as const }
  return {
    OR: [
      { shortCode: contains },
      { title: contains },
      { originalUrl: contains },
      { notes: contains },
      { tags: { has: search.toLowerCase() } },
    ],
  }
}
