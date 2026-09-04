import type { ReactNode } from 'react'

export default function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  )
}
