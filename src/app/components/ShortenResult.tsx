'use client'

import Link from 'next/link'
import { BarChart3, Check, Copy, Sparkles } from 'lucide-react'
import type { ShortenedUrl } from '@/app/components/useCreateShortLink'

interface Props {
  result: ShortenedUrl
  onCopy: (text: string) => void
}

export default function ShortenResult({ result, onCopy }: Props) {
  return (
    <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Smart Link Ready</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <a
              href={result.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-lg font-semibold text-blue-300 hover:underline truncate"
            >
              {result.shortUrl}
            </a>
            <button
              onClick={() => void onCopy(result.shortUrl)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Copy short link"
              aria-label="Copy short link"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          <p className="truncate text-xs text-slate-400">{result.originalUrl}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/links/${encodeURIComponent(result.shortCode)}/qr?size=256`}
            alt="QR Code"
            width={80}
            height={80}
            className="rounded-xl bg-white p-1 shadow"
          />

          <div className="flex flex-col gap-2">
            <a
              href={result.managementUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-400 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" /> Smart Routing
            </a>
            <Link
              href={`/analytics/${result.shortCode}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
