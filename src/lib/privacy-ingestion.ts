import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { ClickData } from '@/lib/queue'

type Policy = { hashIp:boolean; hashVisitor:boolean; storeUserAgent:boolean; storeReferrer:boolean; aggregateOnly:boolean }
const cache = new Map<string,{expires:number;policy:Policy}>()
const DEFAULT:Policy={hashIp:true,hashVisitor:true,storeUserAgent:false,storeReferrer:true,aggregateOnly:false}
export function hashWithWorkspace(value:string, workspaceId:string):string { return createHash('sha256').update(`${workspaceId}:${value}`).digest('hex') }
export function normalizeIp(value:string|null|undefined):string|null {
  const ip=(value||'').trim()
  if (!ip || ip.length>128) return null
  // Only accept literal IPv4/IPv6 values. Never persist a spoofable forwarded
  // header containing an arbitrary identifier as an "IP".
  if (!/^[0-9a-f:.]+$/i.test(ip)) return null
  return ip
}
export async function getPrivacyPolicy(workspaceId:string):Promise<Policy>{const hit=cache.get(workspaceId);if(hit&&hit.expires>Date.now())return hit.policy;const p=await prisma.privacyPolicy.findUnique({where:{workspaceId}});const policy=p?{hashIp:p.hashIp,hashVisitor:p.hashVisitor,storeUserAgent:p.storeUserAgent,storeReferrer:p.storeReferrer,aggregateOnly:p.aggregateOnly}:DEFAULT;cache.set(workspaceId,{policy,expires:Date.now()+30000});return policy}
export async function sanitizeClickForIngestion(item:ClickData, workspaceId:string):Promise<ClickData|null>{const p=await getPrivacyPolicy(workspaceId);const ip=normalizeIp(item.ip);if(p.aggregateOnly)return {...item,ip:null,userAgent:null,referer:null,referrerHost:null,country:null,deviceType:null,trafficType:'human',aiAgent:null,os:null,browser:null,language:null,utmSource:null,utmMedium:null,utmCampaign:null,utmTerm:null,utmContent:null,visitorIdHash:null};return {...item,ip:p.hashIp&&ip?hashWithWorkspace(ip,workspaceId):null,userAgent:p.storeUserAgent?item.userAgent:null,referer:p.storeReferrer?item.referer:null,referrerHost:p.storeReferrer?item.referrerHost:null,visitorIdHash:p.hashVisitor&&item.visitorIdHash?hashWithWorkspace(item.visitorIdHash,workspaceId):null}}
export async function sanitizeAnalyticsMetadata(workspaceId:string, metadata:Record<string, unknown>):Promise<Record<string, unknown>>{const p=await getPrivacyPolicy(workspaceId);if(p.aggregateOnly)return {};const out={...metadata};if(typeof out.ip==='string'){const ip=normalizeIp(out.ip);out.ip=p.hashIp&&ip?hashWithWorkspace(ip,workspaceId):undefined}else delete out.ip;if(!p.storeUserAgent){delete out.userAgent;delete out.os;delete out.browser;delete out.deviceType}if(!p.storeReferrer){delete out.referrerHost;delete out.sourceName;delete out.channel}if(p.hashVisitor&&typeof out.visitorIdHash==='string')out.visitorIdHash=hashWithWorkspace(out.visitorIdHash,workspaceId);else delete out.visitorIdHash;return out}
export function clearPrivacyCache(workspaceId?:string){if(workspaceId)cache.delete(workspaceId);else cache.clear()}
