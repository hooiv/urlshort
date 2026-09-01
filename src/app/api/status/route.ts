import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export async function GET() {
  const started = Date.now()
  const checks: {name:string;status:string;latencyMs:number|null}[] = []
  try { const t=Date.now(); await prisma.$queryRaw`SELECT 1`; checks.push({name:'PostgreSQL',status:'operational',latencyMs:Date.now()-t}) } catch { checks.push({name:'PostgreSQL',status:'degraded',latencyMs:null}) }
  const db = checks[0]?.status === 'operational'
  return NextResponse.json({ status: db ? 'operational' : 'degraded', checks, generatedAt: new Date().toISOString(), responseMs: Date.now()-started }, { status: db ? 200 : 503, headers: {'Cache-Control':'no-store'} })
}
