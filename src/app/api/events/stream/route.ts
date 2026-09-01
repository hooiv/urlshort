
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDefaultWorkspace } from '@/lib/workspaces'
import { subscribeRedis, subscribeLocal } from '@/lib/realtime'
export const dynamic='force-dynamic'
type RealtimeEvent={type:string;id:string;at:string;data:Record<string,unknown>}
export async function GET(request:NextRequest){const u=await getCurrentUser(request);if(!u)return new Response('Unauthorized',{status:401});const w=await getDefaultWorkspace(u.id);if(!w)return new Response('Forbidden',{status:403});const encoder=new TextEncoder();let closed=false;let cleanup=()=>{};const stream=new ReadableStream({async start(controller){const send=(event:RealtimeEvent)=>{if(closed)return;controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))};send({type:'ready',id:'ready',at:new Date().toISOString(),data:{workspaceId:w.id}});const onLocal=(e:RealtimeEvent)=>send(e);const stopLocal=subscribeLocal(onLocal);cleanup=()=>{closed=true;stopLocal();controller.close()};if(process.env.REDIS_URL)await subscribeRedis(send,request.signal);request.signal.addEventListener('abort',cleanup,{once:true});const timer=setInterval(()=>{if(closed){clearInterval(timer);return}controller.enqueue(encoder.encode(': heartbeat\n\n'))},15000)}});return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}})}

