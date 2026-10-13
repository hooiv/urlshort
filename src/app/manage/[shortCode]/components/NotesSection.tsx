'use client'

import { LINK_NOTES_MAX } from '@/lib/link-notes'

interface NotesSectionProps {
  notes: string
  onChange: (value: string) => void
  onSave: () => void
}

export default function NotesSection({ notes, onChange, onSave }: NotesSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="font-semibold text-white">Internal Notes</h2>
      <p className="mt-1 text-xs text-slate-400">Private to your team. Never shown on redirects, previews or public pages.</p>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value.slice(0, LINK_NOTES_MAX))}
        rows={4}
        maxLength={LINK_NOTES_MAX}
        placeholder="Campaign context, owner, approval links…"
        className="input mt-4 w-full"
        aria-label="Internal notes"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">{notes.length}/{LINK_NOTES_MAX}</span>
        <button onClick={onSave} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">Save notes</button>
      </div>
    </section>
  )
}
