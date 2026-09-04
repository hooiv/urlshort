import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCampaignAutopilot, activateScheduledReleases } from '@/lib/campaigns'
import { detectCampaignAnomalies } from '@/lib/anomaly'
import { timingSafeEqual } from 'node:crypto'
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
export async function GET(request:NextRequest){if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});const limit = await rateLimit(request, { name: 'cron-campaigns', limit: 4, windowMs: 60_000 });if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });try{const scheduled=await activateScheduledReleases();const campaigns=await prisma.campaign.findMany({where:{status:'running'},select:{id:true},take:100});const results=[];for(const c of campaigns){try{const auto=await runCampaignAutopilot(c.id);const anomalies=await detectCampaignAnomalies(c.id);results.push({id:c.id,auto,anomalies:anomalies.length})}catch(error){console.error('Campaign cron item failed', c.id, error);results.push({id:c.id,error:'failed'})}}return NextResponse.json({processed:campaigns.length,scheduled,results})}catch(error){console.error('Cron campaigns error:', error);return NextResponse.json({error:'Internal Server Error'},{status:500})}}

