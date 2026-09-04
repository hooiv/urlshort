'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import LinkCard from '@/app/account/components/LinkCard'
import TagFilter from '@/app/account/components/TagFilter'
import type { Url } from '@/app/account/components/types'

export default function LinksSection({
  links,
  search,
  activeTag,
  nextCursor,
  onSearchChange,
  onSelectTag,
  onRefresh,
  onLoadMore,
}: {
  links: Url[]
  search: string
  activeTag: string
  nextCursor: string | null
  onSearchChange: (query: string) => void
  onSelectTag: (tag: string) => void
  onRefresh: () => void
  onLoadMore: () => void
}) {
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div>
            <h2 className="font-semibold">Your links</h2>
            <p className="text-xs text-slate-500">Search, edit, pause, and manage every link you can access.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/account/export"
            download="quicklink-account-export.csv"
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:border-slate-500"
          >
            Export CSV
          </a>
          <Link
            href="/bulk"
            className="rounded-xl bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20"
          >
            Bulk Import
          </Link>
          <div className="relative">
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search code, title, or destination…"
              className="input w-full sm:w-80 pr-12"
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <kbd className="hidden rounded border border-slate-700 bg-slate-800 px-1.5 font-sans text-[10px] font-medium text-slate-400 sm:inline-block">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>
      </div>
      <TagFilter links={links} activeTag={activeTag} onSelect={onSelectTag} />
      {links.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} onChanged={onRefresh} onSelectTag={onSelectTag} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {search || activeTag ? 'No links match your filters.' : 'No account-owned links yet. Create one from the home page.'}
        </p>
      )}
      {nextCursor && (
        <div className="mt-5 text-center">
          <button
            onClick={onLoadMore}
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500"
          >
            Load more
          </button>
        </div>
      )}
    </section>
  )
}
