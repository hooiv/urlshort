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

