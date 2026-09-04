'use client'

import { Search } from 'lucide-react'

/** Interactive audit search input (Enter triggers reload). */
export function AuditSearch({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="relative w-full sm:w-80">
      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-600" aria-hidden="true" />
      <label htmlFor="audit-search" className="sr-only">
        Search audit actions or resources
      </label>
      <input
        id="audit-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        placeholder="Search actions or resources"
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        className="input w-full pl-9"
      />
    </div>
  )
}
