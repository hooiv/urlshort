import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { EDIT_ROLES } from '@/lib/workspaces'
import { visibleUrlWhere } from '@/lib/folders'
import { invalidateLinks } from '@/lib/link-cache'
import { MAX_TAGS_PER_LINK, normalizeTags } from '@/lib/bulk-edit'

/**
 * Rename or merge a tag across every link the caller may edit. Renaming onto an
 * existing tag merges the two (links carrying both end up with one copy).
 */
export const tagRenameSchema = z.object({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
  workspaceId: z.string().min(1).max(128).optional(),
})

export class TagRenameError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 422) {
    super(message)
  }
}

/** Pure: replace `from` by `to` keeping position, dropping duplicates. */
export function replaceTag(tags: string[], from: string, to: string): string[] {
  const out: string[] = []
  for (const tag of tags) {
    const next = tag === from ? to : tag
    if (!out.includes(next)) out.push(next)
  }
  return out
}

export async function renameTag(userId: string, input: z.infer<typeof tagRenameSchema>) {
  const [from] = normalizeTags([input.from])
  const [to] = normalizeTags([input.to])
  if (!from || !to) throw new TagRenameError('Tag names cannot be empty', 400)
  if (from === to) throw new TagRenameError('New tag name is the same as the old one', 400)

  if (input.workspaceId) {
    const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } }, select: { role: true } })
    if (!membership) throw new TagRenameError('Workspace not found', 404)
    if (!EDIT_ROLES.includes(membership.role)) throw new TagRenameError('You need an editor role to rename tags', 403)
  }

  const rows = await prisma.url.findMany({
    where: {
      AND: [
        visibleUrlWhere(userId),
        input.workspaceId ? { workspaceId: input.workspaceId } : { userId, workspaceId: null },
        { deletedAt: null, tags: { has: from } },
      ],
    },
    select: { id: true, shortCode: true, tags: true },
  })

  const plans = rows.map((r) => ({ row: r, tags: replaceTag(r.tags, from, to) }))
  const tooMany = plans.find((p) => p.tags.length > MAX_TAGS_PER_LINK)
  if (tooMany) throw new TagRenameError(`/${tooMany.row.shortCode} would exceed ${MAX_TAGS_PER_LINK} tags`, 422)

  if (plans.length) {
    await prisma.$transaction(plans.map((p) => prisma.url.update({ where: { id: p.row.id }, data: { tags: p.tags }, select: { id: true } })))
    await invalidateLinks(plans.map((p) => p.row))
  }
  return { from, to, updated: plans.length, linkIds: plans.map((p) => p.row.id) }
}

export const tagDeleteSchema = z.object({
  tag: z.string().trim().min(1).max(40),
  workspaceId: z.string().min(1).max(128).optional(),
})

/** Pure: drop a tag, keeping the order of the rest. */
export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag)
}

/** Remove a tag from every link the caller may edit (trashed links are left alone). */
export async function deleteTag(userId: string, input: z.infer<typeof tagDeleteSchema>) {
  const [tag] = normalizeTags([input.tag])
  if (!tag) throw new TagRenameError('Tag name cannot be empty', 400)

  if (input.workspaceId) {
    const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } }, select: { role: true } })
    if (!membership) throw new TagRenameError('Workspace not found', 404)
    if (!EDIT_ROLES.includes(membership.role)) throw new TagRenameError('You need an editor role to delete tags', 403)
  }

  const rows = await prisma.url.findMany({
    where: {
      AND: [
        visibleUrlWhere(userId),
        input.workspaceId ? { workspaceId: input.workspaceId } : { userId, workspaceId: null },
        { deletedAt: null, tags: { has: tag } },
      ],
    },
    select: { id: true, shortCode: true, tags: true },
  })
  if (rows.length) {
    await prisma.$transaction(rows.map((r) => prisma.url.update({ where: { id: r.id }, data: { tags: removeTag(r.tags, tag) }, select: { id: true } })))
    await invalidateLinks(rows)
  }
  return { tag, updated: rows.length }
}

export const tagListSchema = z.object({
  workspaceId: z.string().min(1).max(128).optional(),
  q: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

/** Pure: count tags across link rows, optionally prefix/substring filtered, most-used first (ties alphabetical). */
export function aggregateTags(rows: { tags: string[] }[], q?: string, limit = 100): { tag: string; links: number }[] {
  const needle = q?.trim().toLowerCase()
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const tag of new Set(row.tags)) {
      if (needle && !tag.toLowerCase().includes(needle)) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, links]) => ({ tag, links }))
    .sort((a, b) => b.links - a.links || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

/** Tags in use on the caller's visible, non-trashed links with usage counts (for autocomplete and the tag manager). */
export async function listTags(userId: string, input: z.infer<typeof tagListSchema>) {
  if (input.workspaceId) {
    const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } }, select: { role: true } })
    if (!membership) throw new TagRenameError('Workspace not found', 404)
  }
  const rows = await prisma.url.findMany({
    where: {
      AND: [
        visibleUrlWhere(userId),
        input.workspaceId ? { workspaceId: input.workspaceId } : { userId, workspaceId: null },
        { deletedAt: null, NOT: { tags: { isEmpty: true } } },
      ],
    },
    select: { tags: true },
    take: 20_000,
  })
  return aggregateTags(rows, input.q, input.limit)
}
