import { formatNumber } from '@/lib/format'
import { summarizeLinks } from '@/app/account/components/account-utils'
import type { Url } from '@/app/account/components/types'

export default function SummaryStats({ links }: { links: Url[] }) {
  const { total, active, average } = summarizeLinks(links)
  const stats = [
    { label: 'Links', value: formatNumber(links.length) },
    { label: 'Active', value: formatNumber(active) },
    { label: 'Total clicks', value: formatNumber(total) },
    { label: 'Avg clicks / link', value: formatNumber(average) },
  ]
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-500">{stat.label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</div>
        </div>
      ))}
    </section>
  )
}
