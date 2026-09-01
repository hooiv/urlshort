import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { normalCdf } from '@/lib/stats'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'

type Variant = { id:string; name?:string; weight:number; enabled:boolean; clicks:number; conversions:number; valueCents:bigint|number; valueSquaredCents?:unknown }
export function chooseWeightedVariant<T extends {id:string;weight:number;enabled:boolean}>(variants:T[],seed:string):T|null{const active=variants.filter(v=>v.enabled&&v.weight>0);if(!active.length)return null;const total=active.reduce((n,v)=>n+v.weight,0);const bucket=createHash('sha256').update(seed).digest().readUInt32BE(0)%total;let cursor=0;for(const v of active){cursor+=v.weight;if(bucket<cursor)return v}return active[active.length-1]}
function revenueMoments(v:Variant){const n=v.clicks;if(n<=1)return {mean:0,variance:0};const sum=Number(v.valueCents);const sq=Number(v.valueSquaredCents||0);const mean=sum/n;const variance=Math.max(0,(sq-(sum*sum/n))/(n-1));return {mean,variance}}
function welch(a:Variant,b:Variant){const A=revenueMoments(a),B=revenueMoments(b);const diff=B.mean-A.mean;const se=Math.sqrt(Math.max(1e-12,A.variance/a.clicks+B.variance/b.clicks));const z=diff/se;return {z,pValue:2*(1-normalCdf(Math.abs(z))),uplift:A.mean?diff/A.mean:diff>0?1:0}}
export function alphaForInformation(information:number,alpha=.05){const t=Math.min(1,Math.max(.001,information));const z=1.959963984540054;return Math.max(1e-10,Math.min(alpha,2*(1-normalCdf(z/Math.sqrt(t)))))}

/**
 * Alpha spent at a particular sequential look. The old implementation used an
 * information-fraction boundary without a fixed maximum information plan. That
 * is not valid for an indefinitely repeated autopilot. A summable Bonferroni
 * spending sequence controls the family-wise type-I error for an unbounded number
 * of looks: sum_k alpha_k <= alpha.
 */
export function sequentialAlpha(_clicksA:number,_clicksB:number,_target=10000,alpha=.05,lookNumber=1){
  void _target;
  const look=Math.max(1,Math.floor(lookNumber));
  return Math.max(1e-12,alpha*6/(Math.PI*Math.PI*look*look));
}

export function shiftTrafficWeights(weights:Record<string,number>,controlId:string,winnerId:string,maxShift:number):Record<string,number>|null{
  if(controlId===winnerId)return null;
  const control=Number(weights[controlId]),winner=Number(weights[winnerId]);
  if(!Number.isFinite(control)||!Number.isFinite(winner))return null;
  const shift=Math.min(Math.max(0,Math.floor(maxShift)),Math.max(0,control-1),Math.max(0,99-winner));
  if(shift<1)return null;
  return {...weights,[controlId]:control-shift,[winnerId]:winner+shift};
}
export function compareObjective(a:Variant,b:Variant,objective:string){if(a.clicks<2||b.clicks<2)return {winner:null,confidence:0,uplift:0,pValue:1};if(objective==='conversion_rate'){const pA=a.conversions/a.clicks,pB=b.conversions/b.clicks,pooled=(a.conversions+b.conversions)/(a.clicks+b.clicks),se=Math.sqrt(Math.max(1e-12,pooled*(1-pooled)*(1/a.clicks+1/b.clicks))),z=(pB-pA)/se,p=2*(1-normalCdf(Math.abs(z)));return {winner:pB>pA?'b':'a',confidence:1-p/2,uplift:pA?(pB-pA)/pA:pB>0?1:0,pValue:p}}const r=welch(a,b);return {winner:r.uplift>0?'b':'a',confidence:1-r.pValue/2,uplift:r.uplift,pValue:r.pValue}}
export async function runCampaignAutopilot(campaignId:string,actorUserId?:string,workspaceId?:string){const campaign=await prisma.campaign.findUnique({where:{id:campaignId,...(workspaceId?{workspaceId}:{} )},include:{variants:true,experiments:{where:{status:'running'},orderBy:{createdAt:'desc'},take:1}}});if(!campaign)return {action:'error',reason:'Campaign not found'};if(!campaign.autoOptimize||campaign.status!=='running')return {action:'noop',reason:'Autopilot is not active'};const exp=campaign.experiments[0];if(!exp)return {action:'noop',reason:'Running experiment missing'};const now=new Date();if(exp.cooldownUntil&&exp.cooldownUntil>now)return {action:'cooldown',until:exp.cooldownUntil};const claimed=await prisma.campaignExperiment.updateMany({where:{id:exp.id,status:'running',OR:[{cooldownUntil:null},{cooldownUntil:{lte:now}}]},data:{lookCount:{increment:1},lastLookAt:now,cooldownUntil:new Date(now.getTime()+30*60_000)}});if(claimed.count!==1)return {action:'concurrent',reason:'Another autopilot worker owns this look'};
  // The claim above serializes workers, but the initial campaign read may now be
  // stale. Re-read after claiming so a concurrent mutation cannot overwrite newer
  // variant weights or statistics with the worker's old snapshot.
  const fresh=await prisma.campaign.findUnique({where:{id:campaignId},include:{variants:true,experiments:{where:{id:exp.id}}}});if(!fresh)return {action:'error',reason:'Campaign disappeared after claim'};const freshExp=fresh.experiments[0];if(!freshExp)return {action:'concurrent',reason:'Experiment changed while autopilot was claiming the look'};const variants=fresh.variants.filter(v=>v.enabled);const control=variants.find(v=>v.isControl)||variants[0];if(!control||variants.length<2)return {action:'wait',reason:'At least two active variants are required'};const candidates=variants.filter(v=>v.id!==control.id&&v.clicks>=fresh.minSampleSize&&v.conversions>=fresh.minConversions);if(!candidates.length)return {action:'wait',reason:'Minimum sample requirements not met'};const scored=candidates.map(v=>({v,result:compareObjective(control,v,fresh.objective)})).sort((x,y)=>y.result.confidence-x.result.confidence);const best=scored[0];const alpha=Math.max(1e-12,sequentialAlpha(control.clicks,best.v.clicks,10000,.05,freshExp.lookCount)/Math.max(1,candidates.length));const credible=best.result.pValue<=alpha&&best.result.winner==='b'&&best.result.confidence>=fresh.confidenceThreshold/100;await prisma.campaignExperiment.update({where:{id:freshExp.id},data:{alphaSpent:alpha}});if(!credible)return {action:'wait',reason:'Sequential boundary not crossed',pValue:best.result.pValue,alpha,confidence:best.result.confidence};const maxShift=Math.max(1,Math.min(50,fresh.maxTrafficShiftPercent));const oldWeights=Object.fromEntries(variants.map(v=>[v.id,v.weight]));const newWeights=shiftTrafficWeights(oldWeights,control.id,best.v.id,maxShift);if(!newWeights)return {action:'wait',reason:'Traffic weights cannot be shifted safely'};const snapshotPayload=JSON.stringify({campaignId,version:fresh.version+1,objective:fresh.objective,weights:newWeights,reason:'autopilot',look:freshExp.lookCount,alpha});const previous=await prisma.experimentSnapshot.findFirst({where:{experimentId:freshExp.id},orderBy:{sequence:'desc'}});const contentHash=createHash('sha256').update(`${previous?.contentHash||''}.${snapshotPayload}`).digest('hex');await prisma.$transaction(async tx=>{const versioned=await tx.campaign.updateMany({where:{id:fresh.id,version:fresh.version,status:'running'},data:{version:{increment:1}}});if(versioned.count!==1)throw new Error('Campaign changed concurrently; refusing stale autopilot decision');await tx.campaignVariant.update({where:{id:control.id},data:{weight:newWeights[control.id]}});await tx.campaignVariant.update({where:{id:best.v.id},data:{weight:newWeights[best.v.id]}});await tx.campaignDecision.create({data:{campaignId,experimentId:freshExp.id,action:'shift_traffic',reason:`Autopilot selected ${best.v.name}`,confidenceBps:Math.round(best.result.confidence*10000),oldWeightsJson:JSON.stringify(oldWeights),newWeightsJson:JSON.stringify(newWeights),actorType:'autopilot',actorUserId}});await tx.experimentSnapshot.create({data:{experimentId:freshExp.id,sequence:(previous?.sequence||0)+1,configJson:snapshotPayload,statsJson:JSON.stringify(scored.map(s=>({id:s.v.id,confidence:s.result.confidence,pValue:s.result.pValue,uplift:s.result.uplift,alpha}))),decisionJson:JSON.stringify({action:'shift_traffic',variantId:best.v.id}),contentHash,previousHash:previous?.contentHash}})});await publishWorkspaceRoutingConfig(fresh.workspaceId); return {action:'shift_traffic',variantId:best.v.id,confidence:best.result.confidence,pValue:best.result.pValue,alpha,weights:newWeights}}
export async function createImmutableExperimentSnapshot(experimentId:string,config:unknown,stats:unknown,decision?:unknown){const previous=await prisma.experimentSnapshot.findFirst({where:{experimentId},orderBy:{sequence:'desc'}});const configJson=JSON.stringify(config),statsJson=JSON.stringify(stats),decisionJson=decision==null?null:JSON.stringify(decision);const contentHash=createHash('sha256').update(`${previous?.contentHash||''}.${configJson}.${statsJson}.${decisionJson||''}`).digest('hex');return prisma.experimentSnapshot.create({data:{experimentId,sequence:(previous?.sequence||0)+1,configJson,statsJson,decisionJson,contentHash,previousHash:previous?.contentHash}})}
export async function activateScheduledReleases(now = new Date()) {
  // An approved release without scheduledAt is an immediate release. It must
  // enter the same atomic activation path as scheduled releases; otherwise it
  // can remain "approved" forever because the cron query never selects it.
  const due = await prisma.campaignRelease.findMany({ where: { status: 'approved', OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }, orderBy: [{ scheduledAt: 'asc' }, { version: 'asc' }], take: 100 })
  let activated = 0
  for (const release of due) {
    const changed = await prisma.$transaction(async tx => {
      // A later release may already have advanced the campaign version while
      // this older scheduled release was waiting. Never let a delayed cron run
      // roll the live campaign configuration backwards.
      const campaign = await tx.campaign.findUnique({ where: { id: release.campaignId }, select: { version: true } })
      if (!campaign || release.version <= campaign.version) {
        return false
      }
      const claim = await tx.campaignRelease.updateMany({ where: { id: release.id, status: 'approved', OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }, data: { status: 'published', publishedAt: now } })
      if (claim.count !== 1) return false
      const advanced = await tx.campaign.updateMany({ where: { id: release.campaignId, version: campaign.version }, data: { status: 'running', version: release.version } })
      if (advanced.count !== 1) throw new Error('Campaign changed concurrently; refusing stale scheduled release')
      return true
    })
    if (changed) activated++
  }
  return { found: due.length, activated }
}
