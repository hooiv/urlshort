import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'

function floor15(d:Date){const x=new Date(d);x.setUTCSeconds(0,0);x.setUTCMinutes(Math.floor(x.getUTCMinutes()/15)*15);return x}
function median(v:number[]){if(!v.length)return 0;const a=[...v].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function robustMad(v:number[],center:number){return median(v.map(x=>Math.abs(x-center)))}

export const ANOMALY_TRIGGER_Z=3.5
export const ANOMALY_CRITICAL_Z=6
export const ANOMALY_RECOVERY_Z=2.5

export function classifyAnomaly(observed:number,baseline:number,mad:number){
  const sigma=Math.max(1,1.4826*mad),deviation=(observed-baseline)/sigma,ratio=baseline>0?observed/baseline:observed
  const severity=Math.abs(deviation)>=ANOMALY_CRITICAL_Z||ratio>=8?'critical':Math.abs(deviation)>=ANOMALY_TRIGGER_Z||ratio>=4?'warning':null
  return {sigma,deviation,ratio,severity,type:observed>=baseline?'traffic_spike':'traffic_drop'} as const
}

/** Detect 15-minute traffic anomalies against the same UTC weekday/time over 28 days.
 * Existing anomalies are updated while the signal persists, and only resolve after
 * it crosses a materially lower recovery threshold. This prevents cron retries and
 * noisy threshold oscillation from generating alert storms.
 */
export async function detectCampaignAnomalies(campaignId:string){
  const c=await prisma.campaign.findUnique({where:{id:campaignId},select:{links:{select:{urlId:true}}}})
  if(!c?.links.length)return []
  const ids=c.links.map(x=>x.urlId),now=new Date(),recentStart=floor15(new Date(now.getTime()-15*60000)),historyStart=new Date(recentStart.getTime()-28*86400000)
  const recent=await prisma.clickEvent.count({where:{urlId:{in:ids},createdAt:{gte:recentStart,lt:new Date(recentStart.getTime()+900000)}}})
  const events=await prisma.clickEvent.findMany({where:{urlId:{in:ids},createdAt:{gte:historyStart,lt:recentStart}},select:{createdAt:true},take:200000})
  const byDaySlot=new Map<string,number>();for(const e of events){const d=floor15(e.createdAt),key=d.toISOString().slice(0,10)+'|'+d.getUTCHours()+':'+d.getUTCMinutes();byDaySlot.set(key,(byDaySlot.get(key)||0)+1)}
  const slot=recentStart.getUTCHours()+':'+recentStart.getUTCMinutes(),samples=[] as number[];for(let day=0;day<28;day++){const d=new Date(recentStart.getTime()-(day+1)*86400000);if(d.getUTCDay()===recentStart.getUTCDay())samples.push(byDaySlot.get(d.toISOString().slice(0,10)+'|'+slot)||0)};if(samples.length<4)return []
  const base=median(samples),mad=robustMad(samples,base),signal=classifyAnomaly(recent,base,mad)
  const active=await prisma.campaignAnomaly.findFirst({where:{campaignId,resolvedAt:null,type:signal.type},orderBy:{createdAt:'desc'}})
  if(!signal.severity){
    if(active && Math.abs(signal.deviation)<=ANOMALY_RECOVERY_Z) await prisma.campaignAnomaly.update({where:{id:active.id},data:{resolvedAt:now,detailsJson:JSON.stringify({mad,sigma:signal.sigma,ratio:signal.ratio,sampleCount:samples.length,windowDays:28,bucketMinutes:15,recovered:true})}})
    return []
  }
  const bucket=floor15(recentStart),fingerprint=createHash('sha256').update(campaignId+'|'+signal.type).digest('hex')
  const details=JSON.stringify({mad,sigma:signal.sigma,ratio:signal.ratio,sampleCount:samples.length,windowDays:28,bucketMinutes:15,bucket:bucket.toISOString()})
  if(active){
    const updated=await prisma.campaignAnomaly.update({where:{id:active.id},data:{severity:signal.severity,baseline:base,observed:recent,deviation:signal.deviation,detailsJson:details}})
    return [updated]
  }
  const existing=await prisma.campaignAnomaly.findFirst({where:{campaignId,fingerprint,startedAt:bucket},select:{id:true}});if(existing)return []
  return [await prisma.campaignAnomaly.create({data:{campaignId,fingerprint,type:signal.type,severity:signal.severity,metric:'clicks/15m',baseline:base,observed:recent,deviation:signal.deviation,detailsJson:details,startedAt:bucket}})]
}
