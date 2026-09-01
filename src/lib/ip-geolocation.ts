import { isIP } from 'node:net'
type Geo={country:string|null;region:string|null;city:string|null}
const cache=new Map<string,{expires:number;value:Geo|null}>()
const TTL=6*60*60_000
export async function resolveIpGeolocation(ip:string|null):Promise<Geo|null>{if(!ip||isIP(ip)===0)return null;const hit=cache.get(ip);if(hit&&hit.expires>Date.now())return hit.value;if(!process.env.IPINFO_TOKEN)return null;try{const r=await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`,{headers:{Authorization:`Bearer ${process.env.IPINFO_TOKEN}`},signal:AbortSignal.timeout(800),cache:'no-store'});if(!r.ok)return null;const b=await r.json() as Record<string,unknown>;const value={country:typeof b.country==='string'&&/^[A-Z]{2}$/.test(b.country)?b.country:null,region:typeof b.region==='string'?b.region:null,city:typeof b.city==='string'?b.city:null};cache.set(ip,{expires:Date.now()+TTL,value});return value}catch{return null}}
export function __resetGeoCacheForTests(){cache.clear()}
