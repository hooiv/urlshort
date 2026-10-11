import type { Prisma } from '@prisma/client'
import { resolveReward, parseRules, parseDefault, type RewardScope } from './reward-rules'

export const COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'reversed'] as const
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number]

/** Refund window before a commission becomes payable. */
export const COMMISSION_HOLD_DAYS = 30
export const ACCOUNT_SCOPE = 'account'
export const linkScopeKey = (urlId: string) => `link:${urlId}`

type Db = Prisma.TransactionClient

/** Parse sale metadata attached to a Stripe object; non-scalar values are dropped. */
export function scalarMetadata(...sources: unknown[]): Record<string, string> {
  const out: Record<string, string> = {}
  // Later (more specific) sources are applied last, so they win.
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = String(value)
    }
  }
  return out
}

/** Load the link scope then the account scope (most specific first). Stored JSON that no longer validates is skipped, never trusted. */
export async function loadRewardScopes(db: Db, userId: string, urlId: string): Promise<{ scopes: RewardScope[]; keys: string[] }> {
  const rows = await db.rewardConfig.findMany({
    where: { userId, scopeKey: { in: [linkScopeKey(urlId), ACCOUNT_SCOPE] } },
    select: { scopeKey: true, rules: true, fallback: true },
  })
  const ordered = [linkScopeKey(urlId), ACCOUNT_SCOPE]
    .map((key) => rows.find((r) => r.scopeKey === key))
    .filter((r): r is NonNullable<typeof r> => !!r)
  const scopes: RewardScope[] = []
  const keys: string[] = []
  for (const row of ordered) {
    let rules: unknown = []
    let fallback: unknown = null
    try {
      rules = JSON.parse(row.rules)
      fallback = row.fallback ? JSON.parse(row.fallback) : null
    } catch {
      continue
    }
    const parsedRules = parseRules(rules)
    const parsedDefault = parseDefault(fallback)
    if ('error' in parsedRules || 'error' in parsedDefault) continue
    scopes.push({ rules: parsedRules.rules, fallback: parsedDefault.fallback })
    keys.push(row.scopeKey)
  }
  return { scopes, keys }
}

/**
 * Create the commission for a freshly recorded conversion. Runs inside the
 * conversion's transaction; conversionId is unique so it is idempotent.
 * Returns null when no reward applies (no config, or a zero commission).
 */
export async function recordCommission(
  tx: Db,
  input: { userId: string; urlId: string; conversionId: string; saleValueCents: number; currency: string | null; metadata: Record<string, string>; now: Date },
): Promise<{ id: string; amountCents: number } | null> {
  if (input.saleValueCents <= 0) return null
  const { scopes, keys } = await loadRewardScopes(tx, input.userId, input.urlId)
  if (scopes.length === 0) return null
  const result = resolveReward(input.saleValueCents, input.metadata, scopes)
  if (result.scopeIndex === null || result.cents <= 0) return null
  const hold = new Date(input.now.getTime() + COMMISSION_HOLD_DAYS * 86_400_000)
  const row = await tx.commission.create({
    data: {
      userId: input.userId,
      urlId: input.urlId,
      conversionId: input.conversionId,
      saleValueCents: input.saleValueCents,
      originalCents: result.cents,
      amountCents: result.cents,
      currency: input.currency,
      ruleId: result.ruleId,
      scopeKey: keys[result.scopeIndex],
      holdUntil: hold,
    },
    select: { id: true, amountCents: true },
  })
  return row
}

/** Commission owed after refunding `refundedCents` of a `saleValueCents` sale (floor, so we never overpay). */
export function commissionAfterRefund(originalCents: number, saleValueCents: number, refundedCents: number): number {
  if (saleValueCents <= 0) return 0
  const kept = Math.max(0, saleValueCents - Math.max(0, refundedCents))
  return Math.min(originalCents, Math.floor((originalCents * kept) / saleValueCents))
}

/**
 * Shrink a conversion's commission after a refund (cumulative refunded amount).
 * Unpaid commissions just shrink (fully refunded -> reversed); paid ones keep
 * their amount and record a clawback so the next payout nets it off.
 */
export async function applyRefundToCommission(tx: Db, conversionId: string, refundedTotalCents: number): Promise<{ id: string; status: string; amountCents: number; clawbackCents: number } | null> {
  const row = await tx.commission.findUnique({ where: { conversionId } })
  if (!row) return null
  const owed = commissionAfterRefund(row.originalCents, row.saleValueCents, refundedTotalCents)
  const reduction = row.originalCents - owed
  if (row.status === 'paid') {
    const clawbackCents = reduction
    if (clawbackCents === row.clawbackCents) return row
    return tx.commission.update({ where: { id: row.id }, data: { clawbackCents }, select: { id: true, status: true, amountCents: true, clawbackCents: true } })
  }
  if (row.status === 'reversed') return row
  const status = owed === 0 ? 'reversed' : row.status
  return tx.commission.update({ where: { id: row.id }, data: { amountCents: owed, status }, select: { id: true, status: true, amountCents: true, clawbackCents: true } })
}

const CSV_FIELDS = ['commission_id', 'link', 'conversion_id', 'sale', 'currency', 'commission', 'clawback', 'net_payable', 'status', 'rule', 'scope', 'created_at', 'approved_at', 'paid_at', 'payout_ref'] as const

/** Defuse spreadsheet formula injection and quote per RFC 4180. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const money = (cents: number) => (cents / 100).toFixed(2)

export type CommissionRow = {
  id: string
  conversionId: string
  shortCode: string
  saleValueCents: number
  currency: string | null
  amountCents: number
  clawbackCents: number
  status: string
  ruleId: string | null
  scopeKey: string | null
  createdAt: Date
  approvedAt: Date | null
  paidAt: Date | null
  payoutRef: string | null
}

export function commissionsToCsv(rows: CommissionRow[]): string {
  const lines = [CSV_FIELDS.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.shortCode,
        r.conversionId,
        money(r.saleValueCents),
        r.currency,
        money(r.amountCents),
        money(r.clawbackCents),
        money(Math.max(0, r.amountCents - r.clawbackCents)),
        r.status,
        r.ruleId,
        r.scopeKey,
        r.createdAt.toISOString(),
        r.approvedAt?.toISOString(),
        r.paidAt?.toISOString(),
        r.payoutRef,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export const TRANSITIONS: Record<'approve' | 'pay' | 'reverse', { from: CommissionStatus[]; to: CommissionStatus }> = {
  approve: { from: ['pending'], to: 'approved' },
  pay: { from: ['approved'], to: 'paid' },
  reverse: { from: ['pending', 'approved'], to: 'reversed' },
}

/**
 * Move commissions through the lifecycle in one statement. Guarded by the
 * source status, so racing admins or a repeated click change nothing twice.
 */
export async function transitionCommissions(
  db: Db,
  userId: string,
  action: keyof typeof TRANSITIONS,
  ids: string[],
  opts: { payoutRef?: string; now?: Date } = {},
): Promise<number> {
  if (ids.length === 0) return 0
  const t = TRANSITIONS[action]
  const now = opts.now ?? new Date()
  const data: Prisma.CommissionUpdateManyMutationInput = { status: t.to }
  if (action === 'approve') data.approvedAt = now
  if (action === 'pay') {
    data.paidAt = now
    data.payoutRef = opts.payoutRef ?? null
  }
  const res = await db.commission.updateMany({ where: { id: { in: ids }, userId, status: { in: t.from } }, data })
  return res.count
}

/** A user may configure rewards for links they own or can edit through a workspace they belong to. */
export async function canConfigureLink(db: Pick<Prisma.TransactionClient, 'url' | 'membership'>, userId: string, urlId: string): Promise<boolean> {
  const link = await db.url.findUnique({ where: { id: urlId }, select: { userId: true, workspaceId: true } })
  if (!link) return false
  if (link.userId === userId) return true
  if (!link.workspaceId) return false
  const m = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: link.workspaceId, userId } }, select: { role: true } })
  return !!m && ['owner', 'admin', 'editor'].includes(m.role)
}
