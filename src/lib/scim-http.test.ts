import { describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { createScimToken } from './scim'
const databaseUrl=process.env.SOAK_DATABASE_URL
const port=Number(process.env.SCIM_TEST_PORT||4187), base=`http://127.0.0.1:${port}`
describe('SCIM malformed HTTP clients',()=>{
  it.skipIf(!databaseUrl)('rejects malformed requests through a real HTTP client/server',async()=>{
    const db=new PrismaClient({datasources:{db:{url:databaseUrl!}}}); const slug=`scim-http-${Date.now()}-${Math.random().toString(36).slice(2)}`; const workspace=await db.workspace.create({data:{name:slug,slug}}); const {token,hash}=createScimToken(); await db.scimToken.create({data:{workspaceId:workspace.id,name:'http-test',tokenHash:hash,prefix:token.slice(0,12)}}); let child:ChildProcess|undefined
    try { child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_DATABASE_URL:databaseUrl},stdio:'ignore'}); const deadline=Date.now()+30000; let ready=false; while(Date.now()<deadline){try{const r=await fetch(`${base}/api/scim/${workspace.id}`,{headers:{Authorization:`Bearer ${token}`}}); if(r.status<500){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,300))}; expect(ready).toBe(true)
      expect((await fetch(`${base}/api/scim/${workspace.id}`,{headers:{Authorization:'Bearer invalid'}})).status).toBe(401)
      expect((await fetch(`${base}/api/scim/${workspace.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/scim+json'},body:'{'})).status).toBe(400)
      expect((await fetch(`${base}/api/scim/${workspace.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'text/plain'},body:'{"userName":"a@example.com","externalId":"x"}'})).status).toBe(415)
      expect((await fetch(`${base}/api/scim/${workspace.id}?filter=emails%20eq%20%22unterminated`,{headers:{Authorization:`Bearer ${token}`}})).status).toBe(400)
      expect((await fetch(`${base}/api/scim/${workspace.id}?count=999999999`,{headers:{Authorization:`Bearer ${token}`}})).status).toBe(200)
    } finally { child?.kill(); await db.workspace.delete({where:{id:workspace.id}}); await db.$disconnect() }
  },60000)
})

