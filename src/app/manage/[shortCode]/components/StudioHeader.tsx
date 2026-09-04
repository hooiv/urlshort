'use client'

import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowUpRight,
  BarChart3,
  Copy,
  Globe2,
  QrCode,
  ShieldCheck,
} from 'lucide-react'
import { buildShortUrl, copyText } from '@/app/manage/[shortCode]/components/campaign-utils'

export default function StudioHeader({ shortCode }: { shortCode: string }) {
  const shortUrl = typeof window !== 'undefined' ? buildShortUrl(window.location.origin, shortCode) : `/${shortCode}`

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Campaign Control Studio</span>
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
              /{shortCode}
            </span>
          </div>
          <button
            onClick={() => {
              void copyText(shortUrl).then((ok) => {
                toast.success(ok ? 'Short link copied' : 'Copy failed — select the link manually')
              })
            }}
            className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-300"
          >
            <span className="font-mono truncate max-w-xs">{shortUrl}</span>
            <Copy className="h-3 w-3" />
          </button>
        </div>

        <nav className="flex flex-wrap gap-2">
          <Link
            href={`/analytics/${shortCode}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Analytics
          </Link>
          <Link
            href={`/manage/${shortCode}/qr`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            <QrCode className="h-3.5 w-3.5" /> QR Studio
          </Link>
          <Link
            href={`/manage/${shortCode}/domains`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            <Globe2 className="h-3.5 w-3.5" /> Domains
          </Link>
          <Link
            href={`/manage/${shortCode}/health`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Reliability
          </Link>
          <a
            href={`/${shortCode}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
          >
            <ArrowUpRight className="h-3.5 w-3.5" /> Test Link
          </a>
        </nav>
      </div>
    </header>
  )
}
