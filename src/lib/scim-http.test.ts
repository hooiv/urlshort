import { describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { createServer } from 'node:net'
import { createScimToken } from './scim'
const freePort=()=>new Promise<number>((res,rej)=>{const s=createServer();s.once('error',rej);s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>res(p))})})
const databaseUrl=process.env.SOAK_DATABASE_URL
describe('SCIM malformed HTTP clients',()=>{
  it.skipIf(!databaseUrl)('rejects malformed requests through a real HTTP client/server',async()=>{
    const port=Number(process.env.SCIM_TEST_PORT)||await freePort(), base=`http://127.0.0.1:${port}`; const db=new PrismaClient({datasources:{db:{url:databaseUrl!}}}); const slug=`scim-http-${Date.now()}-${Math.random().toString(36).slice(2)}`; const workspace=await db.workspace.create({data:{name:slug,slug}}); const {token,hash}=createScimToken(); await db.scimToken.create({data:{workspaceId:workspace.id,name:'http-test',tokenHash:hash,prefix:token.slice(0,12)}}); let child:ChildProcess|undefined
    try { child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_DATABASE_URL:databaseUrl},stdio:'ignore',detached:true}); const deadline=Date.now()+120000; let ready=false; while(Date.now()<deadline){try{const r=await fetch(`${base}/api/scim/${workspace.id}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)}); if(r.status<500){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,300))}; expect(ready).toBe(true)
      const H={Authorization:`Bearer ${token}`}; const call=async(u:string,init?:RequestInit)=>{let last:Response|undefined;for(let i=0;i<4;i++){try{last=await fetch(u,{...init,signal:AbortSignal.timeout(60000)});if(last.status<500)return last}catch{}await new Promise(r=>setTimeout(r,500))};if(!last)throw new Error('no response from '+u);return last}
      await call(`${base}/api/scim/${workspace.id}?count=1`,{headers:H}); await call(`${base}/api/scim/${workspace.id}`,{method:'POST',headers:{...H,'Content-Type':'application/scim+json'},body:'{'})
      expect((await call(`${base}/api/scim/${workspace.id}`,{headers:{Authorization:'Bearer invalid'}})).status).toBe(401)
      expect((await call(`${base}/api/scim/${workspace.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/scim+json'},body:'{'})).status).toBe(400)
      expect((await call(`${base}/api/scim/${workspace.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'text/plain'},body:'{"userName":"a@example.com","externalId":"x"}'})).status).toBe(415)
      expect((await call(`${base}/api/scim/${workspace.id}?filter=emails%20eq%20%22unterminated`,{headers:{Authorization:`Bearer ${token}`}})).status).toBe(400)
      expect((await call(`${base}/api/scim/${workspace.id}?count=999999999`,{headers:{Authorization:`Bearer ${token}`}})).status).toBe(200)
    } finally { if(child?.pid){try{process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}}; await db.workspace.delete({where:{id:workspace.id}}); await db.$disconnect() }
  },240000)
})

