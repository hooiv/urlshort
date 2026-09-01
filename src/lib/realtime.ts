import { randomUUID } from 'node:crypto'
import { getRedis } from '@/lib/redis'

export type RealtimeEvent = { type:string; id:string; at:string; data:Record<string,unknown> }
const localListeners = new Set<(event:RealtimeEvent)=>void>()
export function publishRealtime(type:string,data:Record<string,unknown>){const event={type,id:randomUUID(),at:new Date().toISOString(),data};for(const fn of localListeners)fn(event);void getRedis().then(r=>r?.publish('ql:events',JSON.stringify(event))).catch(()=>{})}
export function subscribeLocal(fn:(event:RealtimeEvent)=>void){localListeners.add(fn);return()=>localListeners.delete(fn)}
export async function subscribeRedis(onEvent:(event:RealtimeEvent)=>void, signal:AbortSignal){const url=process.env.REDIS_URL;if(!url)return ()=>{};const Redis=(await import('ioredis')).default;const sub=new Redis(url,{maxRetriesPerRequest:2,enableOfflineQueue:false});await sub.subscribe('ql:events');const handler=(channel:string,message:string)=>{if(channel!=='ql:events')return;try{onEvent(JSON.parse(message))}catch{}};sub.on('message',handler);const close=()=>{sub.removeListener('message',handler);void sub.unsubscribe().catch(()=>{});sub.disconnect()};signal.addEventListener('abort',close,{once:true});return close}