import { headers } from 'next/headers'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'System status' }
export default async function StatusPage() {
  const h = await headers(); const host = h.get('host') || 'localhost:3000'; const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  let data: {status:string;checks:{name:string;status:string;latencyMs:number|null}[]} = {status:'unknown',checks:[]}
  try { const r=await fetch(`${protocol}://${host}/api/status`,{cache:'no-store'}); data=await r.json() } catch {}
  return <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100"><div className="mx-auto max-w-3xl"><p className="text-sm text-blue-300">QuickLink</p><h1 className="mt-2 text-4xl font-semibold">System status</h1><p className="mt-3 text-slate-400">Live service health and dependency readiness.</p><section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><div className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${data.status==='operational'?'bg-emerald-400':'bg-amber-400'}`}/><span className="font-semibold">{data.status==='operational'?'All systems operational':'Some systems need attention'}</span></div><div className="mt-6 divide-y divide-slate-800">{data.checks.map(c=><div key={c.name} className="flex items-center justify-between py-4"><span>{c.name}</span><span className="text-sm text-slate-400">{c.status}{c.latencyMs!=null?` · ${c.latencyMs}ms`:''}</span></div>)}</div></section></div></main>
}
