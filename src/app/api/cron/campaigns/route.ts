import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCampaignAutopilot, activateScheduledReleases } from '@/lib/campaigns'
import { detectCampaignAnomalies } from '@/lib/anomaly'
function authorized(request: NextRequest){const secret=process.env.CRON_SECRET;return !secret || request.headers.get('authorization')===`Bearer ${secret}`}
export async function GET(request:NextRequest){if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});const scheduled=await activateScheduledReleases();const campaigns=await prisma.campaign.findMany({where:{status:'running'},select:{id:true},take:100});const results=[];for(const c of campaigns){try{const auto=await runCampaignAutopilot(c.id);const anomalies=await detectCampaignAnomalies(c.id);results.push({id:c.id,auto,anomalies:anomalies.length})}catch(error){results.push({id:c.id,error:error instanceof Error?error.message:'failed'})}}return NextResponse.json({processed:campaigns.length,scheduled,results})}

