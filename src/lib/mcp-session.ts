import { randomBytes } from 'node:crypto'
import { getRedis } from '@/lib/redis'
export const MCP_MODERN_PROTOCOL_VERSION='2026-07-28'
export const MCP_LEGACY_PROTOCOL_VERSION='2025-06-18'
export const MCP_SESSION_TTL_MS=30*60_000

type Session={userId:string;workspaceId:string;createdAt:number}
const local=new Map<string,{session:Session;expires:number}>()
const key=(id:string)=>`ql:mcp:session:${id}`

/** Legacy 2025-era transport sessions. Modern 2026-era MCP is sessionless. */
export async function createMcpSession(session:Session){const id=`mcp_${randomBytes(24).toString('base64url')}`;const expires=Date.now()+MCP_SESSION_TTL_MS;local.set(id,{session,expires});const r=await getRedis();if(r)await r.set(key(id),JSON.stringify(session),'PX',MCP_SESSION_TTL_MS);return id}
export async function getMcpSession(id:string){
  if(!/^[\x21-\x7e]+$/.test(id))return null
  const r=await getRedis()
  if(r){const raw=await r.get(key(id));if(raw){try{return JSON.parse(raw) as Session}catch{await r.del(key(id))}}}
  const hit=local.get(id);if(!hit||hit.expires<Date.now()){local.delete(id);return null}return hit.session
}
export async function deleteMcpSession(id:string){local.delete(id);const r=await getRedis();if(r)await r.del(key(id))}
