'use client'

export default function CardAction({
  onClick,
  label,
  disabled,
  danger,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50 ${danger ? 'text-red-400/80 hover:text-red-300' : 'text-slate-500 hover:text-white'}`}
    >
      {label}
    </button>
  )
}
