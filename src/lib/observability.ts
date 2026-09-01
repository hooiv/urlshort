import { prisma } from '@/lib/prisma'

export type LatencySummary = { count:number; errors:number; p50:number; p75:number; p95:number; p99:number; errorRate:number }
const samples:number[]=[]
let errors=0
const MAX=20_000
export function recordServerMetric(latencyMs:number,isError=false){if(Number.isFinite(latencyMs)&&latencyMs>=0){samples.push(Math.min(latencyMs,120_000));if(samples.length>MAX)samples.splice(0,samples.length-MAX)}if(isError)errors++}
export function summarizeServerMetrics():LatencySummary{const sorted=[...samples].sort((a,b)=>a-b);const percentile=(p:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)]:0;return{count:sorted.length,errors,p50:percentile(50),p75:percentile(75),p95:percentile(95),p99:percentile(99),errorRate:sorted.length?errors/sorted.length:0}}
export function errorBudgetStatus(summary=summarizeServerMetrics(),target=0.999){const budget=1-target,consumed=Math.min(1,summary.errorRate);return{target,budget,consumed,remaining:Math.max(0,budget-consumed),healthy:consumed<=budget}}
export async function cleanupExpiredOperationalData(now = new Date()) {
  const policies = await prisma.privacyPolicy.findMany({ select: { workspaceId: true, retentionDays: true, auditRetentionDays: true } })
  let clickEvents = 0
  let auditEvents = 0
  for (const policy of policies) {
    const urlIds = (await prisma.url.findMany({ where: { workspaceId: policy.workspaceId }, select: { id: true } })).map(row => row.id)
    const clickCutoff = new Date(now.getTime() - policy.retentionDays * 86400000)
    const auditCutoff = new Date(now.getTime() - policy.auditRetentionDays * 86400000)
    const [clicks, audits] = await prisma.$transaction([
      prisma.clickEvent.deleteMany({ where: { urlId: { in: urlIds }, createdAt: { lt: clickCutoff } } }),
      prisma.auditEvent.deleteMany({ where: { urlId: { in: urlIds }, createdAt: { lt: auditCutoff } } }),
    ])
    clickEvents += clicks.count
    auditEvents += audits.count
  }
  return { clickEvents, auditEvents }
}

