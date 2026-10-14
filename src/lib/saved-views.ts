import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const MAX_SAVED_VIEWS = 25

/** Filter presets for the links table. Unknown keys are rejected so stored views stay portable. */
export const savedViewFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  folderId: z.string().min(1).max(128).optional(),
  status: z.enum(['active', 'expired', 'archived', 'scheduled']).optional(),
  sort: z.enum(['newest', 'oldest', 'clicks', 'alphabetical']).optional(),
}).strict()

export const savedViewInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: savedViewFiltersSchema,
})

export class SavedViewError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) {
    super(message)
  }
}

export type SavedViewInput = z.infer<typeof savedViewInputSchema>

const select = { id: true, name: true, filters: true, createdAt: true, updatedAt: true } as const

export function listSavedViews(userId: string) {
  return prisma.savedView.findMany({ where: { userId }, orderBy: { name: 'asc' }, select })
}

/** Create, or overwrite the filters of the view with the same name (case-sensitive). */
export async function upsertSavedView(userId: string, input: SavedViewInput) {
  const existing = await prisma.savedView.findUnique({ where: { userId_name: { userId, name: input.name } }, select: { id: true } })
  if (!existing) {
    const count = await prisma.savedView.count({ where: { userId } })
    if (count >= MAX_SAVED_VIEWS) throw new SavedViewError(`You can keep at most ${MAX_SAVED_VIEWS} saved views`, 422)
  }
  const view = await prisma.savedView.upsert({
    where: { userId_name: { userId, name: input.name } },
    create: { userId, name: input.name, filters: input.filters },
    update: { filters: input.filters },
    select,
  })
  return { view, created: !existing }
}

export async function deleteSavedView(userId: string, id: string) {
  const { count } = await prisma.savedView.deleteMany({ where: { id, userId } })
  if (count === 0) throw new SavedViewError('Saved view not found', 404)
}
