'use client'

import { METHOD_COLORS } from '@/app/api-docs/components/apiCatalog'
import type { EndpointSpec } from '@/app/api-docs/components/apiCatalog'

interface EndpointListProps {
  groups: Array<[string, EndpointSpec[]]>
  selectedId: string
  onSelect: (spec: EndpointSpec) => void
}

/** Sidebar navigation grouped by API area. */
export default function EndpointList({ groups, selectedId, onSelect }: EndpointListProps) {
  return (
    <aside className="space-y-6">
      {groups.map(([groupName, endpoints]) => (
        <div key={groupName} className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-2">
            {groupName}
          </div>
          {endpoints.map((ep) => (
            <button
              key={ep.id}
              onClick={() => onSelect(ep)}
              className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                selectedId === ep.id
                  ? 'bg-blue-500/10 text-white font-semibold border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <span className="truncate">{ep.title}</span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold border ${
                  METHOD_COLORS[ep.method]
                }`}
              >
                {ep.method}
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}
