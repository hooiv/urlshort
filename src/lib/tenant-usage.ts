import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { Prisma as PrismaTypes } from '@prisma/client'
import type { NextRequest } from 'next/server'
export type UsageMetric='clicks'|'conversions'|'api_requests'|'webhook_deliveries'
type UsageReservation = { allowed:boolean; used:bigint; limit:bigint|null }

const quotaColumn: Record<UsageMetric,string> = {
  clicks: 'clicksPerMonth',
  conversions: 'conversionsPerMonth',
  api_requests: 'apiRequestsPerMonth',
  webhook_deliveries: 'webhookDeliveriesPerMonth',
}

/**
 * Reserve usage while holding the tenant quota row lock. Reading the quota
 * before opening the transaction makes admission decisions stale under an
 * admin update; the lock also serializes all reservations for a tenant.
 */
export async function reserveUsageInTransaction(
  tx: PrismaTypes.TransactionClient,
  workspaceId:string,
  metric:UsageMetric,
  amount=1n,
): Promise<UsageReservation> {
  if (amount <= 0n) throw new Error('Usage reservation amount must be positive')
  const periodKey=new Date().toISOString().slice(0,7)
  // Lock the quota row before reading it. This makes the admission decision
  // serial with concurrent reservations and quota edits without first taking
  // a stale snapshot of the row.
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "tenant_quotas" WHERE "workspaceId" = ${workspaceId} FOR UPDATE
  `)
  let limit: bigint | null = null
  if (lockedRows.length > 0) {
    const lockedQuota = await tx.tenantQuota.findUnique({where:{workspaceId}})
    if (!lockedQuota) throw new Error('Tenant quota row disappeared while locked')
    limit = BigInt(lockedQuota[quotaColumn[metric] as keyof typeof lockedQuota] as bigint)
  }
  let row = await tx.usageBucket.findUnique({where:{workspaceId_metric_periodKey:{workspaceId,metric,periodKey}}})
  if (!row) {
    row = await tx.usageBucket.create({data:{workspaceId,metric,periodKey,quantity:0n}})
  }
  const lockedBucket = await tx.usageBucket.findUnique({where:{id:row.id}})
  if (!lockedBucket) throw new Error('Usage bucket disappeared while locked')
  const next = lockedBucket.quantity + amount
  if (limit !== null && next > limit) return {allowed:false,used:lockedBucket.quantity,limit}
  const updated = await tx.usageBucket.update({where:{id:lockedBucket.id},data:{quantity:amount===0n?lockedBucket.quantity:{increment:amount}}})
  return {allowed:true,used:updated.quantity,limit}
}

export async function reserveUsage(workspaceId:string,metric:UsageMetric,amount=1n){
  return prisma.$transaction(tx=>reserveUsageInTransaction(tx,workspaceId,metric,amount))
}
export async function enforceUsage(_request:NextRequest,workspaceId:string,metric:UsageMetric,amount=1n){return reserveUsage(workspaceId,metric,amount)}


export function usagePeriodKey(date = new Date()): string { return date.toISOString().slice(0, 7) }

export type UsageLease = { unlimited: boolean; granted: bigint; limit: bigint | null; used: bigint }

/**
 * Reserve a *block* of usage under the quota row lock so a hot tenant pays one
 * locked transaction per block instead of per event. The grant shrinks with
 * the remaining headroom (headroom / headroomDivisor, at least 1), so blocks
 * are large when a tenant is far from its limit and exact when close to it.
 * Under a burst the grant also grows to cover the callers already waiting
 * (`demand`), so a spike is served in a few round trips rather than one per
 * small lease. The limit can never be exceeded: every granted unit is
 * committed here.
 *
 * `release` hands back units left over from an earlier lease (possibly in a
 * previous period) inside the same transaction.
 */
export async function reserveUsageLeaseInTransaction(
  tx: PrismaTypes.TransactionClient,
  workspaceId: string,
  metric: UsageMetric,
  maxGrant: bigint,
  headroomDivisor: bigint,
  release?: { periodKey: string; amount: bigint },
  /** Callers already waiting for units: the grant covers them when headroom allows. */
  demand = 1n,
): Promise<UsageLease> {
  if (maxGrant <= 0n || headroomDivisor <= 0n) throw new Error('Lease size and divisor must be positive')
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "tenant_quotas" WHERE "workspaceId" = ${workspaceId} FOR UPDATE
  `)
  if (release && release.amount > 0n) {
    await tx.usageBucket.updateMany({
      where: { workspaceId, metric, periodKey: release.periodKey, quantity: { gte: release.amount } },
      data: { quantity: { decrement: release.amount } },
    })
  }
  if (lockedRows.length === 0) return { unlimited: true, granted: 0n, limit: null, used: 0n }
  const quota = await tx.tenantQuota.findUnique({ where: { workspaceId } })
  if (!quota) throw new Error('Tenant quota row disappeared while locked')
  const limit = BigInt(quota[quotaColumn[metric] as keyof typeof quota] as bigint)
  const periodKey = usagePeriodKey()
  const bucket = await tx.usageBucket.upsert({
    where: { workspaceId_metric_periodKey: { workspaceId, metric, periodKey } },
    create: { workspaceId, metric, periodKey, quantity: 0n },
    update: {},
  })
  const headroom = limit - bucket.quantity
  if (headroom <= 0n) return { unlimited: false, granted: 0n, limit, used: bucket.quantity }
  let grant = headroom / headroomDivisor
  if (grant < demand) grant = demand
  if (grant < 1n) grant = 1n
  if (grant > maxGrant) grant = maxGrant
  if (grant > headroom) grant = headroom
  const updated = await tx.usageBucket.update({ where: { id: bucket.id }, data: { quantity: { increment: grant } } })
  return { unlimited: false, granted: grant, limit, used: updated.quantity }
}

/** Return unused leased units outside of a reservation (idle-lease sweeper). */
export async function releaseUsage(workspaceId: string, metric: UsageMetric, periodKey: string, amount: bigint): Promise<void> {
  if (amount <= 0n) return
  await prisma.usageBucket.updateMany({
    where: { workspaceId, metric, periodKey, quantity: { gte: amount } },
    data: { quantity: { decrement: amount } },
  })
}
