'use client'

import type { Url } from '@/app/account/components/types'

export default function TagFilter({
  links,
  activeTag,
  onSelect,
}: {
  links: Url[]
  activeTag: string
  onSelect: (tag: string) => void
}) {
  const allTags = [...new Set(links.flatMap((link) => link.tags ?? []))].sort()
  if (!allTags.length) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Filter by tag:</span>
      <button
        onClick={() => onSelect('')}
        className={`rounded-full px-3 py-1 text-xs ${!activeTag ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
      >
        All
      </button>
      {allTags.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(tag === activeTag ? '' : tag)}
          className={`rounded-full px-3 py-1 text-xs ${tag === activeTag ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
