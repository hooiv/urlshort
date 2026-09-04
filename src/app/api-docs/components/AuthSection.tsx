'use client'

import Link from 'next/link'
import { ArrowLeft, BookOpen, Eye, EyeOff, KeyRound } from 'lucide-react'

interface AuthSectionProps {
  apiKey: string
  apiKeyVisible: boolean
  onApiKeyChange: (value: string) => void
  onToggleVisibility: () => void
}

/**
 * Sticky docs header: navigation, title, and the credential field.
 * The field accepts an `x-api-key` value, or a per-link management token
 * for endpoints whose spec declares `managementToken` auth.
 */
export default function AuthSection({ apiKey, apiKeyVisible, onApiKeyChange, onToggleVisibility }: AuthSectionProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/account"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
            title="Return to Account"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-400" />
              <span className="font-semibold text-white">Developer API Reference & Live Playground</span>
            </div>
            <p className="text-xs text-slate-500">Programmatic REST API for enterprise link operations</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
            <KeyRound className="h-3.5 w-3.5 text-amber-400" />
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Paste API Key (qlk_...)"
              autoComplete="off"
              spellCheck={false}
              aria-label="API key or management token"
              className="bg-transparent text-slate-200 outline-none w-44 placeholder:text-slate-600 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={onToggleVisibility}
              title={apiKeyVisible ? 'Hide credential' : 'Show credential'}
              aria-label={apiKeyVisible ? 'Hide credential' : 'Show credential'}
              className="text-slate-500 hover:text-white"
            >
              {apiKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Link
            href="/account"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            Manage API Keys
          </Link>
        </div>
      </div>
    </header>
  )
}
