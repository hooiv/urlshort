import { NextRequest, NextResponse } from 'next/server'
import { graphql, buildSchema } from 'graphql'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { assertGraphQLSafe, registerPersistedQuery, resolvePersistedQuery } from '@/lib/graphql-security'
import { subscribeLocal, subscribeRedis, type RealtimeEvent } from '@/lib/realtime'

const schema = buildSchema(`
type Url { id: ID!, shortCode: String!, originalUrl: String!, clicks: Int!, isActive: Boolean! }
type Campaign { id: ID!, name: String!, status: String!, objective: String! }
type Event { id: ID!, type: String!, timestamp: String!, resourceId: String }
type Query { me: String, links(limit: Int = 25): [Url!]!, campaigns(limit: Int = 25): [Campaign!]! }
type Mutation { persistQuery(query: String!): String! }
type Subscription { event(types: [String!]): Event! }
`)
function viewerUrlWhere(userId:string){return {OR:[{userId},{workspace:{members:{some:{userId}}}}]}}

export async function POST(request: NextRequest) {
  const limit=await rateLimit(request,{name:'graphql',limit:120,windowMs:60_000})
  if(!limit.allowed)return NextResponse.json({errors:[{message:'Rate limit exceeded'}]},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}})
  const user=await getCurrentUser(request); if(!user)return NextResponse.json({errors:[{message:'Authentication required'}]},{status:401})
  const body=await request.json().catch(()=>null)
  if(!body || (typeof body.query!=='string' && typeof body.extensions?.persistedQuery?.sha256Hash!=='string')) return NextResponse.json({errors:[{message:'query or persisted query hash is required'}]},{status:400})
  let query=typeof body.query==='string'?body.query:null
  if(!query && body.extensions?.persistedQuery?.sha256Hash) query=resolvePersistedQuery(body.extensions.persistedQuery.sha256Hash)
  if(!query)return NextResponse.json({errors:[{message:'Persisted query not found'}]},{status:400})
  if(query.length>20_000)return NextResponse.json({errors:[{message:'Query is too large'}]},{status:413})
  try{assertGraphQLSafe(query)}catch(error){return NextResponse.json({errors:[{message:error instanceof Error?error.message:'Unsafe query'}]},{status:400})}
  const root={
    me:()=>user.email,
    links:async({limit=25}:{limit?:number})=>prisma.url.findMany({where:viewerUrlWhere(user.id),take:Math.min(Math.max(limit,1),100),orderBy:{createdAt:'desc'},select:{id:true,shortCode:true,originalUrl:true,clicks:true,isActive:true}}),
    campaigns:async({limit=25}:{limit?:number})=>prisma.campaign.findMany({where:{workspace:{members:{some:{userId:user.id}}}},take:Math.min(Math.max(limit,1),100),orderBy:{createdAt:'desc'},select:{id:true,name:true,status:true,objective:true}}),
    persistQuery:({query}:{query:string})=>registerPersistedQuery(query),
  }
  const result=await graphql({schema,source:query,rootValue:root,variableValues:body.variables,operationName:body.operationName})
  return NextResponse.json(result,{status:result.errors?400:200,headers:{'Cache-Control':'no-store'}})
}

export async function GET(request:NextRequest){
  const user=await getCurrentUser(request); if(!user)return new Response('Authentication required',{status:401})
  const query=request.nextUrl.searchParams.get('query')
  if(!query || !/\bsubscription\b/.test(query)) return NextResponse.json({error:'Use a GraphQL subscription operation'},{status:400})
  try{assertGraphQLSafe(query)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unsafe query'},{status:400})}
  const encoder=new TextEncoder(); let timer:ReturnType<typeof setInterval>|undefined; let stopLocal=()=>{}; let stopRedis=()=>{}
  const types=new Set((request.nextUrl.searchParams.get('types')||'').split(',').filter(Boolean))
  const stream=new ReadableStream({async start(controller){
    const send=(event:RealtimeEvent)=>{if(types.size&&!types.has(event.type))return;controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))}
    send({type:'ready',id:'ready',at:new Date().toISOString(),data:{userId:user.id}})
    stopLocal=subscribeLocal(send); if(process.env.REDIS_URL)stopRedis=await subscribeRedis(send,request.signal)
    timer=setInterval(()=>controller.enqueue(encoder.encode(': heartbeat\n\n')),15_000)
    request.signal.addEventListener('abort',()=>{if(timer)clearInterval(timer);stopLocal();stopRedis();controller.close()},{once:true})
  },cancel(){if(timer)clearInterval(timer);stopLocal();stopRedis()}})
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}})
}
