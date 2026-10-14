import type { PrismaClient } from '@prisma/client'
import { autoTagRulesSchema, type AutoTagRule } from '@/lib/auto-tag-rules'

type Db = Pick<PrismaClient, 'workspaceAutoTagRules'>

/** Stored rules, or [] when none/corrupt (fails open so link creation is never blocked by bad config). */
export async function loadAutoTagRules(db: Db, workspaceId: string): Promise<AutoTagRule[]> {
  const row = await db.workspaceAutoTagRules.findUnique({ where: { workspaceId } })
  if (!row) return []
  let raw: unknown = null
  try { raw = JSON.parse(row.rules) } catch { /* handled below */ }
  const parsed = autoTagRulesSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('Ignoring invalid workspace auto-tag rules', workspaceId)
    return []
  }
  return parsed.data
}
