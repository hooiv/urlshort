import { NextRequest, NextResponse } from 'next/server'
import { samlFor, createSamlRelayState } from '@/lib/saml'
import { rateLimit } from '@/lib/rate-limit'

/** Allow only absolute-path return targets (blocks open redirects). */
export function sanitizeReturnTo(raw: string | null): string {
  const value = raw || '/dashboard'
  return /^\/(?!\/)/.test(value) ? value : '/dashboard'
}
export async function GET(request:NextRequest,{params}:{params:Promise<{connectionId:string}>}){const {connectionId}=await params;try{const limit=await rateLimit(request,{name:'sso-login',limit:30,windowMs:60*60_000});if(!limit.allowed)return NextResponse.json({error:'Too many SAML requests. Try again later.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}});const saml=await samlFor(connectionId);const returnTo=sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo'));const relay=await createSamlRelayState(connectionId,returnTo);const url=await saml.getAuthorizeUrlAsync(relay,request.headers.get('host')||undefined,{});const response=NextResponse.redirect(url,302);response.cookies.set('ql_saml_relay',relay,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:300,path:'/'});return response}catch{return NextResponse.json({error:'SSO connection not found'},{status:404})}}
