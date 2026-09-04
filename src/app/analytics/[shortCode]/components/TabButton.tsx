'use client'

import type { ReactNode } from 'react'

export default function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition ${
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{badge}</span>
      )}
    </button>
  )
}
