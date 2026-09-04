import { NextRequest, NextResponse, after } from 'next/server'
import { forwardQueryParams, isBillableTraffic, resolveDestination } from '@/lib/redirect'
import { verifyUnlockToken } from '@/lib/password-gate'
import type { TrafficKind } from '@/lib/smart-routing'
export const runtime='nodejs'
// Delivery fast-path over signed routing snapshots. This route intentionally
// stays fetch + Web Crypto only (no prisma, queue, or node:* imports) so it
// can move back to `runtime = 'edge'` unchanged. Shared route policy comes
// from `@/lib/redirect` (pure helpers) and `@/lib/password-gate`
// (timing-safe checker) — never duplicated here.
type Rule={enabled:boolean;healthStatus?:string|null;countryCodes?:string|null;deviceType?:string|null;trafficType?:string|null;aiAgent?:string|null;os?:string|null;languageCodes?:string|null;referrerDomain?:string|null;startAt?:string|null;endAt?:string|null;priority:number;weight:number;destinationUrl:string}
type Variant={enabled:boolean;weight:number;destinationUrl:string}
type Campaign={id:string;version?:number;variants:Variant[]}
type Link={shortCode:string;originalUrl:string;expiresAt:string|null;expiredUrl?:string|null;passwordHash?:string|null;locked?:boolean|null;revision:string|null;rules:Rule[];campaigns:Campaign[]}
type EdgeConfig={previousHash?:string;contentHash:string;signature:string;version?:number;link:Link}
let lastGood:EdgeConfig|null=null
let lastGoodAt=0
function list(v:string|null|undefined){return(v||'').split(/[\s,]+/).filter(Boolean).map(x=>x.toLowerCase())}
function match(r:Rule,c:{country:string;device:string;trafficType:string;aiAgent:string|null;os:string;language:string;referrer:string}){return r.enabled&&r.healthStatus!=='down'&&(!r.countryCodes||list(r.countryCodes).includes(c.country))&&(!r.deviceType||r.deviceType===c.device)&&(!r.trafficType||r.trafficType===c.trafficType)&&(!r.aiAgent||list(r.aiAgent).includes(c.aiAgent||''))&&(!r.os||list(r.os).includes(c.os))&&(!r.languageCodes||list(r.languageCodes).includes(c.language))&&(!r.referrerDomain||c.referrer===r.referrerDomain.toLowerCase())&&(!r.startAt||Date.now()>=Date.parse(r.startAt))&&(!r.endAt||Date.now()<=Date.parse(r.endAt))}
async function bucket(seed:string,total:number){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed));const b=new Uint8Array(d);return ((((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3])>>>0)%total)}
async function choose(items:Array<{enabled:boolean;weight:number;destinationUrl:string}>,seed:string){const active=items.filter(v=>v.enabled&&v.weight>0);if(!active.length)return null;const total=active.reduce((n,v)=>n+v.weight,0),n=await bucket(seed,total);let c=0;for(const v of active){c+=v.weight;if(n<c)return v}return active[active.length-1]}
async function verifyConfig(body:EdgeConfig){const secret=process.env.QL_CONFIG_SIGNING_SECRET||process.env.QL_ATTRIBUTION_SECRET;if(!secret)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const raw=body.signature.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(body.signature.length/4)*4,'=');try{return await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(raw),c=>c.charCodeAt(0)),new TextEncoder().encode((body.previousHash||'')+'.'+body.contentHash))}catch{return false}}
async function loadConfig(request:NextRequest,shortCode:string){const base=new URL('/api/edge/config/'+encodeURIComponent(shortCode),request.url);const replica=process.env.QL_EDGE_REPLICA_URL;const origins=[replica?new URL('/api/edge/config/'+encodeURIComponent(shortCode),replica).toString():null,base.toString()].filter(Boolean) as string[];for(const target of origins){try{const r=await fetch(target,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(1500)});if(!r.ok)continue;const body=await r.json() as EdgeConfig;if(await verifyConfig(body)){lastGood=body;lastGoodAt=Date.now();return body}}catch{}}if(lastGood&&Date.now()-lastGoodAt<5*60_000)return lastGood;return null}
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Validated visitor identity. The cookie is attacker-controlled, so only
// well-formed UUIDs are trusted as sticky-bucketing seeds — mirroring
// getVisitorId in src/lib/smart-routing. Implemented locally because that
// module imports node:crypto (no edge equivalent); globalThis.crypto here is
// Web Crypto and edge-safe.
function getEdgeVisitor(request:NextRequest){const existing=request.cookies.get('ql_visitor')?.value;if(existing&&UUID_PATTERN.test(existing))return{id:existing,isNew:false};return{id:crypto.randomUUID(),isNew:true}}
function setVisitorCookie(response:NextResponse,visitorId:string):void{response.cookies.set('ql_visitor',visitorId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:60*60*24*90,path:'/'})}
export async function GET(request:NextRequest,{params}:{params:Promise<{shortCode:string}>}){
const {shortCode}=await params;const origin=new URL(request.url).origin
if(!/^[A-Za-z0-9_-]{1,64}$/.test(shortCode))return NextResponse.redirect(new URL('/404',origin),307)
const body=await loadConfig(request,shortCode);if(!body)return new NextResponse('Link configuration unavailable',{status:503,headers:{'Retry-After':'5'}});const link=body.link
// Timing-safe password gate. The old edge route never checked the gate and
// served protected destinations to anyone holding the edge URL. Reuses the
// shared constant-time checker — never `===` against the cookie value.
if(link.passwordHash||link.locked){const unlocked=verifyUnlockToken(link.shortCode,request.cookies.get(`ql_unlocked_${link.shortCode}`)?.value);if(!unlocked)return NextResponse.redirect(new URL(`/protected/${link.shortCode}`,origin),307)}
// Expiry honors the owner's fallback URL, else the shared /expired page —
// the old bare `410 Link expired` broke parity with the main route.
if(link.expiresAt&&Date.now()>Date.parse(link.expiresAt))return link.expiredUrl?NextResponse.redirect(link.expiredUrl,307):NextResponse.redirect(new URL('/expired',origin),307)
const ua=request.headers.get('user-agent')||'';const ai=/GPTBot|OAI-SearchBot|ChatGPT-User/i.test(ua)?'openai':/ClaudeBot|Claude-User/i.test(ua)?'anthropic':/PerplexityBot/i.test(ua)?'perplexity':/Google-Extended|Gemini/i.test(ua)?'google-ai':null;const bot=/bot|crawler|spider|slurp|headless/i.test(ua);const device=/ipad|tablet/i.test(ua)?'tablet':/mobi|iphone|android/i.test(ua)?'mobile':'desktop';const traffic=(ai?'ai_agent':bot?'bot':'human') as TrafficKind
// Sticky identity: the old route seeded buckets with `x-forwarded-for || UA`
// (spoofable, unstable across networks). The validated visitor UUID gives
// stable per-visitor bucketing like the main route.
const visitor=getEdgeVisitor(request)
const language=(request.headers.get('accept-language')||'en').split(',')[0].split('-')[0].toLowerCase();const country=(request.headers.get('x-vercel-ip-country')||request.headers.get('cf-ipcountry')||'xx').toLowerCase();let ref='';try{ref=new URL(request.headers.get('referer')||'').hostname.replace(/^www\./,'').toLowerCase()}catch{};
let ruleUrl:string|null=null;let campaignUrl:string|null=null
const campaign=link.campaigns?.find(Boolean);if(campaign){const v=await choose(campaign.variants,`${shortCode}:${visitor.id}:campaign:${campaign.version??campaign.id}`);if(v)campaignUrl=v.destinationUrl}
const rules=link.rules.filter(r=>match(r,{country,device,trafficType:traffic,aiAgent:ai,os:/iphone|ipad|mac os x/i.test(ua)?'ios':/android/i.test(ua)?'android':/windows/i.test(ua)?'windows':/mac/i.test(ua)?'macos':'other',language,referrer:ref})).sort((a,b)=>a.priority-b.priority);if(rules.length){const v=await choose(rules.filter(r=>r.priority===rules[0].priority),`${shortCode}:${visitor.id}:${rules[0].priority}`);if(v)ruleUrl=v.destinationUrl}
// Capped query-param forwarding with explicit precedence. The old uncapped
// loop let hostile query strings grow the Location header without bound, and
// a corrupt destination threw an unhandled 500. A corrupt destination is a
// broken link (404), never an outage (503).
let destination:string;try{destination=forwardQueryParams(resolveDestination({ruleUrl,campaignUrl,revisionUrl:link.revision,fallbackUrl:link.originalUrl}),request.nextUrl.searchParams)}catch{return NextResponse.redirect(new URL('/404',origin),307)}
// Bot quota exclusion. The edge tier never reserves quota itself (stateless);
// it tags the event so the durable queue excludes crawler traffic from tenant
// quota and max-clicks accounting — mirroring ClickData.nonBillable.
const billable=isBillableTraffic(traffic)
// Attribution tokens: the edge tier mints no per-visitor tokens at all, for
// bots or humans. A per-visitor token must never be served under a shared
// cache key, so edge serves the canonical destination and leaves token
// minting to the main route. No HTML is rendered here either — the redirect
// is a pure 307 with no interpolation surface, so the main route's bot/pixel
// branches must keep using jsString (never escapeHtml) inside <script>.
const finalDestination=destination
// Single durable handoff. The old edge route recorded nothing, and the fix
// must NOT be an inline fetch(webhookUrl): that would double-deliver next to
// the durable consumer. Exactly one fire-and-forget beacon per redirect
// (idempotent clickEventId, no retries here); webhook fan-out happens
// downstream in the durable click queue after persistence — never here.
const clickEventId=crypto.randomUUID();const beaconTarget=new URL('/api/edge/click',origin).toString();const beaconBody=JSON.stringify({clickEventId,shortCode:link.shortCode,trafficType:traffic,deviceType:device,country,referrer:ref||null,usageReserved:false,nonBillable:!billable})
after(()=>fetch(beaconTarget,{method:'POST',headers:{'content-type':'application/json'},body:beaconBody,signal:AbortSignal.timeout(1500)}).catch(err=>console.error('Edge click beacon failed:',err)))
const response=NextResponse.redirect(finalDestination,307)
// Buckets vary per visitor, so responses must never sit in a shared cache.
response.headers.set('Cache-Control','private, no-store');if(visitor.isNew)setVisitorCookie(response,visitor.id);return response
}
