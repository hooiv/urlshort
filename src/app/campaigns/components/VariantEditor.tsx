'use client'

export function VariantEditor({
  label,
  name,
  setName,
  url,
  setUrl,
}: {
  label: string
  name: string
  setName: (value: string) => void
  url: string
  setUrl: (value: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <span className="text-[10px] font-semibold tracking-[0.16em] text-slate-500">{label}</span>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        className="mt-2 w-full bg-transparent text-sm font-medium outline-none"
      />
      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        type="url"
        placeholder="https://example.com/landing"
        required
        maxLength={4096}
        className="mt-2 w-full border-t border-slate-800 bg-transparent pt-2 text-sm text-slate-400 outline-none placeholder:text-slate-700"
      />
    </div>
  )
}
