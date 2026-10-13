/** Maximum pinned links per account view; keeps the pinned strip glanceable and the query bounded. */
export const MAX_PINNED_LINKS = 20

/** Maps a `pinned` boolean from the API to the stored timestamp (null unpins). */
export function parsePinned(input: unknown, now: Date = new Date()): Date | null {
  if (typeof input !== 'boolean') throw new Error('pinned must be a boolean')
  return input ? now : null
}

/**
 * Puts pinned links (most recently pinned first) ahead of the first page and removes
 * them from the page body so none appears twice. The page size stays `take`.
 */
export function pinnedFirst<T extends { id: string }>(pinned: T[], page: T[], take: number): T[] {
  const seen = new Set(pinned.map((row) => row.id))
  const rest = page.filter((row) => !seen.has(row.id))
  return [...pinned, ...rest].slice(0, Math.max(take, pinned.length))
}
