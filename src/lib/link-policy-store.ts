import type { PrismaClient } from '@prisma/client'
import { evaluateLinkPolicy, linkPolicySchema, type LinkPolicy, type PolicyLinkInput } from '@/lib/link-policy'

type Db = Pick<PrismaClient, 'workspaceLinkPolicy'>

/** The stored policy, or null when the workspace has none. A corrupt row fails open (logged) rather than blocking all link creation. */
export async function loadWorkspacePolicy(db: Db, workspaceId: string): Promise<LinkPolicy | null> {
  const row = await db.workspaceLinkPolicy.findUnique({ where: { workspaceId } })
  if (!row) return null
  const parsed = linkPolicySchema.safeParse(safeJson(row.policy))
  if (!parsed.success) {
    console.error('Ignoring invalid workspace link policy', workspaceId)
    return null
  }
  return parsed.data
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/** Single human-readable error for the first violations, or null when compliant. */
export async function policyErrorMessage(policy: LinkPolicy | null, link: PolicyLinkInput): Promise<string | null> {
  if (!policy) return null
  const violations = evaluateLinkPolicy(policy, link)
  if (!violations.length) return null
  return `Workspace link policy: ${violations.map((v) => v.message).join('; ')}`
}
