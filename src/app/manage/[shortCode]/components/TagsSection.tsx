'use client'

import toast from 'react-hot-toast'
import { normalizeNewTag } from '@/app/manage/[shortCode]/components/campaign-utils'

interface TagsSectionProps {
  tags: string[]
  tagInput: string
  onTagInputChange: (value: string) => void
  onUpdateTags: (tags: string[]) => void
}

export default function TagsSection({ tags, tagInput, onTagInputChange, onUpdateTags }: TagsSectionProps) {
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
    </section>
  )
}
