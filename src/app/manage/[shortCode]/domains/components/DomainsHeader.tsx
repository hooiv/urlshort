'use client'

import Link from 'next/link'
import { ArrowLeft, ExternalLink, Globe2, QrCode } from 'lucide-react'

export default function DomainsHeader({ shortCode }: { shortCode: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/manage/${shortCode}`}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
            title="Return to Campaign Controls"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-blue-400" />
              <span className="font-semibold text-white">Custom Branded Domains</span>
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
                /{shortCode}
              </span>
            </div>
            <p className="text-xs text-slate-500">Route through your own domain with full edge routing and analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/manage/${shortCode}/qr`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            <QrCode className="h-3.5 w-3.5" /> QR Studio
          </Link>
          <a
            href={`/${shortCode}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Test Link
          </a>
        </div>
      </div>
    </header>
  )
}
