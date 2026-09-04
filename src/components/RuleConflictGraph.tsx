'use client'
import { useEffect, useState } from 'react'
import {
  conflictGraphViewBox,
  isConflictGraphPayload,
  layoutConflictNodes,
  truncateNodeLabel,
  type ConflictNodeInput,
} from '@/components/rule-conflict-logic'

type Edge = {
  a: { id: string; name: string; priority: number }
  b: { id: string; name: string; priority: number }
  severity: 'critical' | 'warning'
  reason: string
}

export default function RuleConflictGraph({ shortCode }: { shortCode: string }) {
  const [data, setData] = useState<{ nodes: ConflictNodeInput[]; edges: Edge[] } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let stale = false
    fetch(`/api/links/${encodeURIComponent(shortCode)}/routing/conflicts`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (stale || controller.signal.aborted) return
        if (isConflictGraphPayload(json)) setData(json as { nodes: ConflictNodeInput[]; edges: Edge[] })
        else setData(null)
      })
      .catch(() => {
        // Graceful: leave the section hidden when the API is unreachable.
      })
    return () => {
      stale = true
      controller.abort()
    }
  }, [shortCode])
  if (!data) return null
  const pos = layoutConflictNodes(data.nodes)
  const box = conflictGraphViewBox(pos.length)
  const summary = `${data.edges.length} routing conflicts among ${data.nodes.length} rules`
  const byId = new Map(pos.map((n) => [n.id, n]))
  return (
    <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Routing conflict graph</h2>
          <p className="mt-1 text-xs text-slate-500">Overlapping enabled rules are shown as edges.</p>
        </div>
        <span className="rounded-full border border-slate-800 px-2 py-1 text-xs text-slate-400">
          {data.edges.length} conflicts
        </span>
      </div>
      <div className="mt-5 overflow-auto">
        <svg viewBox={`0 0 ${box.width} ${box.height}`} role="img" aria-label={summary} className="min-w-[920px] h-[260px]">
          <title>{summary}</title>
          {data.edges.map((e, i) => {
            const a = byId.get(e.a.id)
            const b = byId.get(e.b.id)
            if (!a || !b) return null
            return (
              <line
                key={i}
                x1={a.x + 70}
                y1={a.y + 25}
                x2={b.x + 70}
                y2={b.y + 25}
                strokeWidth="2"
                className={e.severity === 'critical' ? 'stroke-red-500' : 'stroke-amber-500'}
              />
            )
          })}
          {pos.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect width="140" height="50" rx="10" className="fill-slate-900 stroke-slate-700" />
              <text x="10" y="20" className="fill-slate-100 text-[11px]">
                {truncateNodeLabel(n.label)}
              </text>
              <text x="10" y="38" className="fill-slate-500 text-[9px]">
                P{n.priority} · {n.weight}%
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}
