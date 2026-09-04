import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getDefaultWorkspace } from '@/lib/workspaces'
import { getIdempotentResponse, storeIdempotentResponse } from '@/lib/idempotency'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { requireWorkspaceRole, EDIT_ROLES, ANALYTICS_ROLES } from '@/lib/workspaces'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'

const variantSchema = z.object({ name: z.string().trim().min(1).max(120), destinationUrl: z.string().url().max(4096), isControl: z.boolean().optional(), weight: z.number().int().min(1).max(100) })
const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  primaryUrlId: z.string().cuid(),
  objective: z.enum(['conversion_rate','revenue_per_click','revenue','conversion_value']).default('conversion_rate'),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  autoOptimize: z.boolean().default(false),
  confidenceThreshold: z.number().int().min(90).max(99).default(95),
  minSampleSize: z.number().int().min(25).max(1000000).default(100),
  minConversions: z.number().int().min(3).max(100000).default(10),
  maxTrafficShiftPercent: z.number().int().min(1).max(50).default(20),
  variants: z.array(variantSchema).min(2).max(20),
})
export function areVariantWeightsValid(variants: Array<{ weight: number }>): boolean {
  return variants.reduce((n, v) => n + v.weight, 0) === 100
}

export function hasSingleControl(variants: Array<{ isControl?: boolean }>): boolean {
  return variants.filter((v) => v.isControl).length <= 1
}

export function toCampaignCreateError(e: unknown): { error: string; status: number } {
  if (e instanceof z.ZodError) return { error: 'Invalid campaign', status: 400 }
  if (e instanceof Error) {
    if (/weights must total 100/i.test(e.message)) return { error: 'Variant weights must total 100', status: 400 }
    if (/only one control/i.test(e.message)) return { error: 'Only one control variant is allowed', status: 400 }
    if (/idempotency-key/i.test(e.message)) return { error: e.message, status: 400 }
    if ((e as { code?: string }).code === 'P2002') return { error: 'Campaign slug already exists', status: 409 }
  }
  return { error: 'Unable to create campaign', status: 400 }
}
async function workspaceFor(request: NextRequest) { const user = await getCurrentUser(request); return user ? getDefaultWorkspace(user.id) : null }
function serializeCampaign<T extends { variants?: Array<{ valueCents: bigint }>; [key: string]: unknown }>(campaign: T) {
  return JSON.parse(JSON.stringify(campaign, (_key, value) => typeof value === 'bigint' ? value.toString() : value)) as Omit<T, 'variants'> & { variants?: Array<Omit<NonNullable<T['variants']>[number], 'valueCents'> & { valueCents: string }> }
}

export async function GET(request: NextRequest) {
  const workspace = await workspaceFor(request)
  if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await requireWorkspaceRole(request, workspace.id, ANALYTICS_ROLES)
  if (role.error) return NextResponse.json({ error: role.error }, { status: role.status })
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: workspace.id },
    include: { variants: true, _count: { select: { links: true, experiments: true, anomalies: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(campaigns.map(serializeCampaign))
}
export async function POST(request: NextRequest) {
 const workspace = await workspaceFor(request); if (!workspace) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 try {
   const limit = await rateLimit(request, { name: 'campaigns-create', limit: 30, windowMs: 60_000 })
   if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
   const role = await requireWorkspaceRole(request, workspace.id, EDIT_ROLES)
   if (role.error) return NextResponse.json({ error: role.error }, { status: role.status })
   const body = createSchema.parse(await request.json())
   const idem = await getIdempotentResponse(request, workspace.id, body)
   if (idem?.existing) return new NextResponse(idem.existing.responseJson,{status:idem.existing.responseStatus,headers:{'Content-Type':'application/json','Idempotent-Replay':'true'}})
   if (!hasSingleControl(body.variants)) return NextResponse.json({error:'Only one control variant is allowed'},{status:400})
   if (!areVariantWeightsValid(body.variants)) return NextResponse.json({error:'Variant weights must total 100'},{status:400})

   const primaryUrl = await prisma.url.findFirst({ where: { id: body.primaryUrlId, workspaceId: workspace.id, deletedAt: null }, select: { id: true, shortCode: true } })
   if (!primaryUrl) return NextResponse.json({ error: 'Choose a link from this workspace as the campaign entrypoint' }, { status: 400 })
   for (const variant of body.variants) {
     try { await assertDestinationSafeForStorage(variant.destinationUrl) }
     catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Variant destination is not allowed' }, { status: 400 }) }
   }

   const campaign=await prisma.$transaction(async tx => {
     const created = await tx.campaign.create({data:{workspaceId:workspace.id,primaryUrlId:primaryUrl.id,name:body.name,slug:body.slug,objective:body.objective,currency:body.currency,autoOptimize:body.autoOptimize,confidenceThreshold:body.confidenceThreshold,minSampleSize:body.minSampleSize,minConversions:body.minConversions,maxTrafficShiftPercent:body.maxTrafficShiftPercent,status:'draft',variants:{create:body.variants.map((v,i)=>({name:v.name,destinationUrl:v.destinationUrl,isControl:v.isControl??i===0,weight:v.weight}))},experiments:{create:{objective:body.objective,status:'draft'}}},include:{variants:true}})
     await tx.campaignLink.create({ data: { campaignId: created.id, urlId: primaryUrl.id } })
     return created
   })
   await publishWorkspaceRoutingConfig(workspace.id)
   const responseBody={campaign: serializeCampaign(campaign)}
   if(idem) await storeIdempotentResponse({workspaceId:workspace.id,keyHash:idem.keyHash,requestHash:idem.requestHash,method:request.method,path:request.nextUrl.pathname,status:201,body:responseBody})
   await recordAudit(request, { action: 'campaign.create', resourceType: 'campaign', resourceId: campaign.id, after: { name: campaign.name, slug: campaign.slug, primaryUrlId: primaryUrl.id, variantCount: campaign.variants.length } })
   return NextResponse.json(responseBody,{status:201})
 } catch(e){console.error('Campaign create failed:', e);const safe=toCampaignCreateError(e);return NextResponse.json({error:safe.error},{status:safe.status})}
}
