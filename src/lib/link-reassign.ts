import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { EDIT_ROLES } from '@/lib/workspaces'

/**
 * Hand over every link a member created in a workspace to another member
 * (offboarding). Only the creator column changes: short codes, clicks, folders
 * and settings stay as they are, so nothing redirects differently.
 */
export const reassignSchema = z.object({
  fromUserId: z.string().min(1).max(64),
  toUserId: z.string().min(1).max(64),
  dryRun: z.boolean().optional(),
  confirm: z.boolean().optional(),
}).strict()

export class ReassignError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function validateReassign(input: z.infer<typeof reassignSchema>): string | null {
  if (input.fromUserId === input.toUserId) return 'Source and target member must differ'
  if (!input.dryRun && input.confirm !== true) return 'Reassigning changes link ownership. Preview with dryRun: true or resend with confirm: true.'
  return null
}

export async function reassignLinks(workspaceId: string, input: z.infer<typeof reassignSchema>) {
  const problem = validateReassign(input)
  if (problem) throw new ReassignError(problem, 400)

  const target = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: input.toUserId } } })
  if (!target) throw new ReassignError('Target user is not a member of this workspace', 404)
  if (!EDIT_ROLES.includes(target.role)) throw new ReassignError('Target member needs an editor role or higher to own links', 409)

  const where = { workspaceId, userId: input.fromUserId }
  if (input.dryRun) {
    const [links, trashed] = await Promise.all([
      prisma.url.count({ where: { ...where, deletedAt: null } }),
      prisma.url.count({ where: { ...where, deletedAt: { not: null } } }),
    ])
    return { dryRun: true as const, matched: links, trashed, reassigned: 0 }
  }
  // Trashed links move too, so a later restore does not resurrect an ex-member as owner.
  const res = await prisma.url.updateMany({ where, data: { userId: input.toUserId } })
  return { dryRun: false as const, matched: res.count, trashed: 0, reassigned: res.count }
}
