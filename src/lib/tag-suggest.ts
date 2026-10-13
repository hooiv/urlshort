import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { visibleUrlWhere } from '@/lib/folders'
import { normalizeTags } from '@/lib/bulk-edit'

export const tagSuggestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  workspaceId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

export interface SuggestionSample {
  originalUrl: string
  tags: string[]
}

export interface TagSuggestion {
  tag: string
  score: number
  reason: 'same-path' | 'same-host'
}

/** Host without www, lowercased; null for unparseable input. */
export function hostOf(raw: string): string | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function firstSegment(raw: string): string | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

/**
 * Pure ranking: learn from how the user already tagged links to the same site.
 * A tag seen on links sharing host AND first path segment counts triple; a
 * host-only match counts once. Ties break alphabetically for stable output.
 */
export function rankTagSuggestions(url: string, samples: SuggestionSample[], limit = 5): TagSuggestion[] {
  const host = hostOf(url)
  if (!host) return []
  const segment = firstSegment(url)
  const scores = new Map<string, { score: number; reason: TagSuggestion['reason'] }>()
  for (const s of samples) {
    if (hostOf(s.originalUrl) !== host) continue
    const samePath = !!segment && firstSegment(s.originalUrl) === segment
    for (const tag of new Set(s.tags)) {
      const cur = scores.get(tag) ?? { score: 0, reason: 'same-host' as const }
      cur.score += samePath ? 3 : 1
      if (samePath) cur.reason = 'same-path'
      scores.set(tag, cur)
    }
  }
  return [...scores.entries()]
    .map(([tag, v]) => ({ tag, score: v.score, reason: v.reason }))
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

export async function suggestTags(userId: string, input: z.infer<typeof tagSuggestSchema>) {
  const host = hostOf(input.url)
  if (!host) return []
  const rows = await prisma.url.findMany({
    where: {
      AND: [
        visibleUrlWhere(userId),
        input.workspaceId ? { workspaceId: input.workspaceId } : { userId, workspaceId: null },
        { deletedAt: null, tags: { isEmpty: false }, originalUrl: { contains: host, mode: 'insensitive' } },
      ],
    },
    select: { originalUrl: true, tags: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return rankTagSuggestions(input.url, rows.map((r) => ({ originalUrl: r.originalUrl, tags: normalizeTags(r.tags) })), input.limit)
}
