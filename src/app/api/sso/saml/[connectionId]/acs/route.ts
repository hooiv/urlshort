import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { samlFor, createSsoSession, verifySamlRelayState } from '@/lib/saml'
import { rateLimit } from '@/lib/rate-limit'

/** Timing-safe relay binding check (cookie vs form field). */
export function relayMatches(cookie: string, form: string): boolean {
  if (!cookie || !form) return false
  const a = Buffer.from(cookie)
  const b = Buffer.from(form)
  return a.length === b.length && timingSafeEqual(a, b)
}
export async function POST(request:NextRequest,{params}:{params:Promise<{connectionId:string}>}){const {connectionId}=await params;try{const limit=await rateLimit(request,{name:'sso-acs',limit:20,windowMs:5*60_000});if(!limit.allowed)return new Response('Too many SAML attempts. Please try again later.',{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}});const form=await request.formData();const samlResponse=String(form.get('SAMLResponse')||'');const relay=String(form.get('RelayState')||'');const cookie=request.cookies.get('ql_saml_relay')?.value;if(!samlResponse||!relay||!cookie||!relayMatches(cookie,relay))return new Response('Invalid SAML relay state',{status:400});const state=await verifySamlRelayState(relay,connectionId);if(!state)return new Response('Expired or invalid SAML relay state',{status:401});const result=await (await samlFor(connectionId)).validatePostResponseAsync({SAMLResponse:samlResponse});if(!result.profile)return new Response('SAML authentication failed',{status:401});const c=await prisma.ssoConnection.findUnique({where:{id:connectionId}});if(!c)return new Response('SAML authentication failed',{status:401});const target=new URL(state.returnTo,request.url);const response=NextResponse.redirect(target);await createSsoSession(result.profile,c.workspaceId,request,response,c.id);response.cookies.set('ql_saml_relay','',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:0,path:'/'});return response}catch{return new Response('SAML authentication failed',{status:401})}}

