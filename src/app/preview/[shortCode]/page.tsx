import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldAlert, ShieldCheck, Lock } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { buildLinkPreview } from '@/lib/link-preview'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Link preview', robots: { index: false, follow: false } }

const STATUS_TEXT: Record<string, string> = {
  live: 'Active', scheduled: 'Not live yet', expired: 'Expired', disabled: 'Disabled', limit_reached: 'Click limit reached',
}

export default async function PreviewPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortCode)) notFound()
  const link = await prisma.url.findUnique({
    where: { shortCode },
    select: { shortCode: true, originalUrl: true, title: true, description: true, isActive: true, deletedAt: true, startsAt: true, expiresAt: true, maxClicks: true, clicks: true, passwordHash: true, cloaked: true },
  })
  const p = link ? buildLinkPreview(link) : null
  if (!p) notFound()
  const risky = p.safety?.status === 'review'
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Link preview · /{p.shortCode}</p>
        <h1 className="mt-3 text-xl font-bold text-white">{p.title ?? p.host ?? 'Protected link'}</h1>
        {p.description && <p className="mt-1 text-sm text-slate-400">{p.description}</p>}
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd>{STATUS_TEXT[p.status]}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Destination</dt><dd className="break-all text-right">{p.protectedByPassword ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Password protected</span> : p.destination ?? p.host ?? 'Hidden by owner'}</dd></div>
          {p.secure !== null && <div className="flex justify-between gap-4"><dt className="text-slate-500">Connection</dt><dd>{p.secure ? 'HTTPS' : 'Not encrypted (HTTP)'}</dd></div>}
        </dl>
        <div className={`mt-6 flex items-start gap-2 rounded-xl border p-3 text-xs ${risky ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
          {risky ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{risky ? `Review before visiting: ${p.safety?.reason}` : 'No risk signals found for this destination.'}</span>
        </div>
        {p.status === 'live' && (
          <Link href={`/${p.shortCode}`} className="mt-6 inline-flex w-full justify-center rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white hover:bg-blue-500">Continue to link</Link>
        )}
      </div>
    </main>
  )
}
