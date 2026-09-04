import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getDefaultWorkspace, requireWorkspaceRole } from '@/lib/workspaces'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
export const schema=z.object({campaignIds:z.array(z.string().min(1)).min(1).max(50),action:z.enum(['start','pause','archive'])})
export async function POST(request:NextRequest){
 const user=await getCurrentUser(request); if(!user)return NextResponse.json({error:'Authentication required'},{status:401})
 const workspaceId=request.nextUrl.searchParams.get('workspaceId')||(await getDefaultWorkspace(user.id))?.id; if(!workspaceId)return NextResponse.json({error:'Workspace required'},{status:403})
 const access=await requireWorkspaceRole(request,workspaceId,['owner','admin','editor']); if(!access.membership)return NextResponse.json({error:access.error},{status:access.status})
 const limit=await rateLimit(request,{name:'campaigns-bulk',limit:10,windowMs:60_000}); if(!limit.allowed)return NextResponse.json({error:'Too many requests'},{status:429})
 try{const b=schema.parse(await request.json());const ids=[...new Set(b.campaignIds)];const campaigns=await prisma.campaign.findMany({where:{id:{in:ids},workspaceId},select:{id:true,status:true}});if(campaigns.length!==ids.length)return NextResponse.json({error:'One or more campaigns are not in this workspace'},{status:404});const target=b.action==='start'?'running':b.action==='pause'?'paused':'archived';const allowed=b.action==='start'?['draft','paused','scheduled']:b.action==='pause'?['running']:['draft','paused','completed'];const invalid=campaigns.filter(c=>!allowed.includes(c.status));if(invalid.length)return NextResponse.json({error:`${invalid.length} campaign(s) cannot be ${b.action}ed from their current state`},{status:409});await prisma.campaign.updateMany({where:{id:{in:ids},workspaceId},data:{status:target,version:{increment:1}}});await publishWorkspaceRoutingConfig(workspaceId);await recordAudit(request,{action:`campaign.bulk_${b.action}`,resourceType:'campaign_batch',metadata:{workspaceId,campaignIds:ids,count:ids.length}});return NextResponse.json({ok:true,updated:ids.length,action:b.action})}catch(e){console.error('Bulk campaign failed:',e);return NextResponse.json({error:e instanceof z.ZodError?'Invalid bulk campaign request':'Bulk operation failed'},{status:400})}}
