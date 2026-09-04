import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { cleanupExpiredOperationalData } from '@/lib/observability'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const headerSecret = request.headers.get('x-cron-secret') || ''
  const expected = Buffer.from(secret, 'utf8')
  const candidates = [bearer, headerSecret]
  return candidates.some((candidate) => {
    if (!candidate) return false
    const actual = Buffer.from(candidate, 'utf8')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}
export async function GET(request: NextRequest) {
  return POST(request)
}
export async function POST(request: NextRequest){if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});const limit = await rateLimit(request, { name: 'cron-privacy', limit: 4, windowMs: 60_000 });if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });try{const now=new Date();const due=await prisma.dataDeletionRequest.findMany({where:{status:'pending',scheduledFor:{lte:now}},take:25});let completed=0;for(const row of due){try{await prisma.$transaction(async tx=>{await tx.dataDeletionRequest.update({where:{id:row.id},data:{status:'processing'}});await tx.session.deleteMany({where:{userId:row.userId}});await tx.apiKey.deleteMany({where:{userId:row.userId}});await tx.passwordResetToken.deleteMany({where:{userId:row.userId}});await tx.emailVerificationToken.deleteMany({where:{userId:row.userId}});await tx.bioProfile.deleteMany({where:{userId:row.userId}});await tx.webhookEndpoint.deleteMany({where:{userId:row.userId}});await tx.url.updateMany({where:{userId:row.userId},data:{userId:null,deletedAt:now,isActive:false}});await tx.membership.deleteMany({where:{userId:row.userId}});await tx.user.delete({where:{id:row.userId}});await tx.dataDeletionRequest.update({where:{id:row.id},data:{status:'completed',completedAt:now}})});completed++}catch(error){await prisma.dataDeletionRequest.update({where:{id:row.id},data:{status:'failed'}}).catch(()=>{});console.error('Account deletion failed',row.id,error)}}const cleanup=await cleanupExpiredOperationalData(now);return NextResponse.json({processed:due.length,completed,cleanup})}catch(error){console.error('Cron privacy error:', error);return NextResponse.json({error:'Internal Server Error'},{status:500})}}