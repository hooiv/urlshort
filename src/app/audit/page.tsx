/* eslint-disable react-hooks/set-state-in-effect -- initial fetch synchronizes remote audit state after mount. */
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react'

type Event={id:string;action:string;actorType:string;resourceType:string|null;resourceId:string|null;createdAt:string;metadataJson:string|null}
export default function AuditPage(){
 const [events,setEvents]=useState<Event[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true)
 async function load(q=''){setLoading(true);try{const r=await fetch(`/api/account/audit?search=${encodeURIComponent(q)}`);if(r.ok)setEvents(await r.json())}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 return <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100"><div className="mx-auto max-w-5xl"><Link href="/account" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4"/>Account</Link><div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-blue-300"><ShieldCheck className="h-5 w-5"/>Audit log</div><h1 className="mt-2 text-3xl font-semibold">Account activity</h1><p className="mt-2 text-sm text-slate-500">Searchable, append-only operational history. IP addresses are hashed.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-600"/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load(search)}} placeholder="Search actions or resources" className="input w-full pl-9"/></div></div><section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">{loading?<div className="p-8 text-sm text-slate-500">Loading audit history…</div>:events.length===0?<div className="p-8 text-sm text-slate-500">No matching audit events.</div>:<div className="divide-y divide-slate-800">{events.map(e=><div key={e.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="font-medium">{e.action}</div><div className="mt-1 text-xs text-slate-500">{e.resourceType||'account'}{e.resourceId?` · ${e.resourceId}`:''} · {e.actorType}</div></div><time className="text-xs text-slate-600">{new Date(e.createdAt).toLocaleString()}</time></div>)}</div>}</section></div></main>
}

