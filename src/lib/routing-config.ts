import { createHash, createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function routingLockKey(workspaceId: string): string { return `routing-config:${workspaceId}` }

export function signRoutingConfig(payload: string, previousHash: string | null): { hash: string; signature: string } {
  const hash = sha256(payload)
  const secret = process.env.QL_CONFIG_SIGNING_SECRET || process.env.QL_ATTRIBUTION_SECRET
  if (!secret) throw new Error('QL_CONFIG_SIGNING_SECRET is required to publish routing configurations')
  const signature = createHmac('sha256', secret).update(`${previousHash || ''}.${hash}`).digest('base64url')
  return { hash, signature }
}

export function verifyRoutingConfig(payload: string, previousHash: string | null, hash: string, signature: string): boolean {
  const secret = process.env.QL_CONFIG_SIGNING_SECRET || process.env.QL_ATTRIBUTION_SECRET
  if (!secret || sha256(payload) !== hash) return false
  const expected = createHmac('sha256', secret).update(`${previousHash || ''}.${hash}`).digest('base64url')
  return expected.length === signature.length && createHash('sha256').update(expected).digest('hex') === createHash('sha256').update(signature).digest('hex')
}

export function shouldAcceptRoutingSnapshot(current: { version:number; contentHash:string }|null, incoming: { version:number; contentHash:string; previousHash:string|null; payloadJson:string; signature:string }): boolean {
  if (!verifyRoutingConfig(incoming.payloadJson, incoming.previousHash, incoming.contentHash, incoming.signature)) return false
  if (current && incoming.version <= current.version) return false
  if (current && incoming.previousHash !== current.contentHash) return false
  return true
}

export async function publishRoutingSnapshot(workspaceId: string, payload: unknown) {
  const body = canonicalJson(payload)
  return prisma.$transaction(async (tx) => {
    // Serialize publication per workspace. Without a database-level lock two
    // simultaneous routing mutations can both observe version N and race to
    // create version N+1, breaking the immutable hash chain.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${routingLockKey(workspaceId)}))`)
    const latest = await tx.routingConfigSnapshot.findFirst({ where: { workspaceId }, orderBy: { version: 'desc' } })
    const { hash, signature } = signRoutingConfig(body, latest?.contentHash ?? null)
    return tx.routingConfigSnapshot.create({ data: {
      workspaceId, version: (latest?.version ?? 0) + 1, payloadJson: body,
      contentHash: hash, previousHash: latest?.contentHash ?? null, signature,
    } })
  })
}

export async function replicateRoutingSnapshot(snapshot: { id:string; workspaceId:string; version:number; payloadJson:string; contentHash:string; previousHash:string|null; signature:string }) {
  const replica = process.env.QL_EDGE_REPLICA_URL
  if (!replica) return false
  try {
    const res=await fetch(replica,{method:'POST',headers:{'content-type':'application/json','x-quicklink-signature':snapshot.signature,'x-quicklink-version':String(snapshot.version),'x-quicklink-content-hash':snapshot.contentHash,'x-quicklink-previous-hash':snapshot.previousHash||''},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(3000)})
    if(!res.ok)throw new Error(`Edge replica returned ${res.status}`)
    await prisma.routingConfigSnapshot.update({where:{id:snapshot.id},data:{replicatedAt:new Date(),replicationAttempts:{increment:1}}})
    return true
  } catch(e) {
    await prisma.routingConfigSnapshot.update({where:{id:snapshot.id},data:{replicationAttempts:{increment:1}}}).catch(()=>{})
    console.error('Edge config replication failed',e)
    return false
  }
}

export async function publishWorkspaceRoutingConfig(workspaceId: string) {
  // Read the routing state only after acquiring the same per-workspace lock used
  // to allocate snapshot versions. Otherwise a slow read can publish stale state
  // after a newer mutation has already committed.
  const snapshot = await prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${routingLockKey(workspaceId)}))`)
    const urls = await tx.url.findMany({ where: { workspaceId, isActive: true }, include: { rules: true, revisions: { orderBy: { effectiveAt: 'desc' }, take: 1 }, campaignLinks: { include: { campaign: { include: { variants: true } } } } } })
    const payload = { generatedAt: new Date().toISOString(), links: urls.map(u => ({ shortCode: u.shortCode, originalUrl: u.originalUrl, expiresAt: u.expiresAt?.toISOString() || null, rules: u.rules.map(r => ({ id:r.id,name:r.name,destinationUrl:r.destinationUrl,priority:r.priority,weight:r.weight,enabled:r.enabled,countryCodes:r.countryCodes,deviceType:r.deviceType,trafficType:r.trafficType,aiAgent:r.aiAgent,os:r.os,languageCodes:r.languageCodes,referrerDomain:r.referrerDomain,startAt:r.startAt?.toISOString()||null,endAt:r.endAt?.toISOString()||null,healthStatus:r.healthStatus })), revision:u.revisions[0]?.destinationUrl || null, campaigns:u.campaignLinks.filter(x=>x.campaign.status==='running').map(x=>({ id:x.campaign.id, version:x.campaign.version, variants:x.campaign.variants.map(v=>({id:v.id,destinationUrl:v.destinationUrl,weight:v.weight,enabled:v.enabled})) })) })) }
    const body = canonicalJson(payload)
    const latest = await tx.routingConfigSnapshot.findFirst({ where: { workspaceId }, orderBy: { version: 'desc' } })
    const { hash, signature } = signRoutingConfig(body, latest?.contentHash ?? null)
    return tx.routingConfigSnapshot.create({ data: { workspaceId, version:(latest?.version??0)+1, payloadJson:body, contentHash:hash, previousHash:latest?.contentHash??null, signature } })
  })
  await replicateRoutingSnapshot(snapshot)
  return snapshot
}


