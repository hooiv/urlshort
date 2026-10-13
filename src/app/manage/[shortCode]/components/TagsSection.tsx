'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { normalizeNewTag } from '@/app/manage/[shortCode]/components/campaign-utils'

interface TagsSectionProps {
  tags: string[]
  tagInput: string
  onTagInputChange: (value: string) => void
  onUpdateTags: (tags: string[]) => void
  destinationUrl?: string
}

export default function TagsSection({ tags, tagInput, onTagInputChange, onUpdateTags, destinationUrl }: TagsSectionProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!destinationUrl) return
    const controller = new AbortController()
    fetch(`/api/tags/suggest?url=${encodeURIComponent(destinationUrl)}&limit=6`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { suggestions: [] }))
      .then((data: { suggestions?: { tag: string }[] }) => setSuggestions((data.suggestions ?? []).map((item) => item.tag)))
      .catch(() => setSuggestions([]))
    return () => controller.abort()
  }, [destinationUrl])

  const available = suggestions.filter((tag) => !tags.includes(tag))

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="font-semibold text-white">Campaign Tags</h2>
      <p className="mt-1 text-xs text-slate-400">Organize and filter your links across workspaces.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300"
          >
            #{tag}
            <button
              onClick={() => onUpdateTags(tags.filter((t) => t !== tag))}
              className="hover:text-white"
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          let next: string | null
          try {
            next = normalizeNewTag(tagInput, tags)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Invalid tag')
            return
          }
          if (next) {
            onUpdateTags([...tags, next])
            onTagInputChange('')
          }
        }}
        className="mt-4 flex gap-3 max-w-sm"
      >
        <input
          value={tagInput}
          onChange={(e) => onTagInputChange(e.target.value)}
          placeholder="Add a tag…"
          className="input flex-1"
        />
        <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
          Add Tag
        </button>
      </form>

      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Suggested tags">
          <span className="text-xs text-slate-500">Used on similar links:</span>
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onUpdateTags([...tags, tag])}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-blue-500/50 hover:text-white"
            >
              + #{tag}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
