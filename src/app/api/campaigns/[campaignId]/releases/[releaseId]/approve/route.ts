import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { approvalDecision } from '@/lib/release-approval'
import { rateLimit } from '@/lib/rate-limit'

export const approveSchema = z.object({
  approved: z.boolean(),
  comment: z.string().trim().max(2000).optional(),
})

export async function POST(request:NextRequest,{params}:{params:Promise<{campaignId:string;releaseId:string}>}) {
  const {campaignId,releaseId}=await params
  const u=await getCurrentUser(request)
  if(!u)return NextResponse.json({error:'Unauthorized'},{status:401})
  const membership=await prisma.membership.findFirst({where:{userId:u.id,workspace:{campaigns:{some:{id:campaignId}}}}})
  if(!membership||!['owner','admin'].includes(membership.role))return NextResponse.json({error:'Only owners/admins can approve releases'},{status:403})
  const limit=await rateLimit(request,{name:'campaigns-release-approve',limit:30,windowMs:60_000})
  if(!limit.allowed)return NextResponse.json({error:'Too many requests'},{status:429})
  const parsed=approveSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return NextResponse.json({error:'approved must be boolean'},{status:400})
  const body=parsed.data
  const approved = body.approved
  const release=await prisma.campaignRelease.findFirst({where:{id:releaseId,campaignId}})
  if(!release)return NextResponse.json({error:'Release not found'},{status:404})
  if (release.createdById && release.createdById === u.id) return NextResponse.json({error:'Release creators cannot approve their own release'},{status:403})
  if (release.status !== 'pending_approval') return NextResponse.json({error:'Release is no longer awaiting approval'},{status:409})
  const approval=await prisma.campaignReleaseApproval.upsert({where:{releaseId_reviewerUserId:{releaseId,reviewerUserId:u.id}},create:{releaseId,reviewerUserId:u.id,roleSnapshot:membership.role,status:body.approved?'approved':'rejected',comment:body.comment?.slice(0,2000),decidedAt:new Date()},update:{status:body.approved?'approved':'rejected',comment:body.comment?.slice(0,2000),decidedAt:new Date(),roleSnapshot:membership.role}})
  const result=await prisma.$transaction(async tx=>{
    const approvals=await tx.campaignReleaseApproval.findMany({where:{releaseId,status:'approved'}})
    const required=release.requiredApprovalRoles.split(',').map(x=>x.trim()).filter(Boolean)
    const rolesSatisfied=required.every(r=>approvals.some(a=>a.roleSnapshot===r))
    const decision=approvalDecision({creatorUserId:release.createdById || '',reviewerUserId:u.id,approved,approvedCount:approvals.length,quorum:release.approvalQuorum,requiredRoles:required,approvedRoles:approvals.map(a=>a.roleSnapshot||'')})
    if(decision.status==='approved') {
      const updated=await tx.campaignRelease.updateMany({where:{id:releaseId,status:'pending_approval'},data:{status:'approved'}})
      if(updated.count!==1) return {status:'pending_approval' as const,approvals,required,rolesSatisfied}
    }
    if(decision.status==='rejected') await tx.campaignRelease.updateMany({where:{id:releaseId,status:'pending_approval'},data:{status:'rejected'}})
    return {status:decision.status,approvals,required,rolesSatisfied}
  })
  return NextResponse.json({approval,approvedCount:result.approvals.length,quorum:release.approvalQuorum,requiredRoles:result.required,rolesSatisfied:result.rolesSatisfied,releaseStatus:result.status})
}

