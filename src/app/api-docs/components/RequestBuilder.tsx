'use client'

import { Play, Send } from 'lucide-react'
import { methodHasBody } from '@/app/api-docs/components/apiCatalog'
import type { EndpointSpec } from '@/app/api-docs/components/apiCatalog'

interface RequestBuilderProps {
  endpoint: EndpointSpec
  resolvedPath: string
  pathParamValues: Record<string, string>
  queryParamValues: Record<string, string>
  requestBodyText: string
  pathErrors: string[]
  bodyError: string | null
  executing: boolean
  onPathParamChange: (name: string, value: string) => void
  onQueryParamChange: (name: string, value: string) => void
  onBodyChange: (value: string) => void
  onResetBody: () => void
  onExecute: () => void
}

/** Interactive console: path/query inputs, JSON editor, and send button. */
export default function RequestBuilder({
  endpoint,
  resolvedPath,
  pathParamValues,
  queryParamValues,
  requestBodyText,
  pathErrors,
  bodyError,
  executing,
  onPathParamChange,
  onQueryParamChange,
  onBodyChange,
  onResetBody,
  onExecute,
}: RequestBuilderProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Play className="h-4 w-4 text-emerald-400" />
          <span>Live Interactive Console</span>
        </div>
        <span className="font-mono text-xs text-blue-400 truncate max-w-md">{resolvedPath}</span>
      </div>

      {endpoint.pathParams && endpoint.pathParams.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Path Parameters</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {endpoint.pathParams.map((p) => {
              const invalid = pathErrors.includes(p.name)
              return (
                <div key={p.name}>
                  <label className="block text-xs text-slate-400 mb-1">{p.name}</label>
                  <input
                    value={pathParamValues[p.name] || ''}
                    onChange={(e) => onPathParamChange(p.name, e.target.value)}
                    placeholder={p.placeholder}
                    aria-label={`Path parameter ${p.name}`}
                    aria-invalid={invalid}
                    className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono ${
                      invalid ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {invalid && <p className="mt-1 text-[11px] text-red-400">This path parameter is required.</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {endpoint.queryParams && endpoint.queryParams.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Query Parameters</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {endpoint.queryParams.map((q) => (
              <div key={q.name}>
                <label className="block text-xs text-slate-400 mb-1">{q.name}</label>
                <input
                  value={queryParamValues[q.name] || ''}
                  onChange={(e) => onQueryParamChange(q.name, e.target.value)}
                  placeholder={q.placeholder}
                  aria-label={`Query parameter ${q.name}`}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {methodHasBody(endpoint.method) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">JSON Request Payload</span>
            <button
              type="button"
              onClick={onResetBody}
              className="text-blue-400 hover:underline text-[11px]"
            >
              Reset to Default
            </button>
          </div>
          <textarea
            rows={6}
            value={requestBodyText}
            onChange={(e) => onBodyChange(e.target.value)}
            aria-label="JSON request payload"
            aria-invalid={Boolean(bodyError)}
            spellCheck={false}
            className={`w-full rounded-xl border bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500 ${
              bodyError ? 'border-red-500' : 'border-slate-800'
            }`}
          />
          {bodyError && <p className="text-[11px] text-red-400">{bodyError}</p>}
        </div>
      )}

      <button
        disabled={executing}
        onClick={onExecute}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-500 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 disabled:opacity-60 transition"
      >
        <Send className="h-3.5 w-3.5" />
        {executing ? 'Executing Request…' : `Send ${endpoint.method} Request`}
      </button>
    </section>
  )
}
