'use client'

import { useEffect, useState } from 'react'

export type PreflightIssue = { code: string; severity: 'error' | 'warning' | 'info'; message: string }
export type PreflightState = {
  status: 'idle' | 'checking' | 'done' | 'error'
  issues: PreflightIssue[]
  ok: boolean
}

const IDLE: PreflightState = { status: 'idle', issues: [], ok: true }
const ORDER = { error: 0, warning: 1, info: 2 } as const

/** Normalises an /api/links/preflight response; unknown shapes become an error state. Pure, unit-tested. */
export function toPreflightState(data: unknown): PreflightState {
  const d = data as { ok?: unknown; issues?: unknown } | null
  if (!d || !Array.isArray(d.issues)) return { status: 'error', issues: [], ok: true }
  const issues = d.issues
    .filter((i): i is PreflightIssue => !!i && typeof i.message === 'string' && i.severity in ORDER && typeof i.code === 'string')
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  return { status: 'done', issues, ok: d.ok !== false }
}

/** True only for strings worth sending: parseable http(s) URL. Avoids a request per keystroke of a half-typed URL. */
export function isCheckable(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

/** Debounced destination pre-flight (reachability, risk, click-ids, duplicates); aborts stale requests. */
export function usePreflight(url: string, workspaceId?: string | null, delayMs = 700): PreflightState {
  const trimmed = url.trim()
  const [state, setState] = useState<PreflightState>(IDLE)
  const checkable = isCheckable(trimmed)

  useEffect(() => {
    if (!checkable) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setState({ status: 'checking', issues: [], ok: true })
      try {
        const res = await fetch('/api/links/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed, ...(workspaceId ? { workspaceId } : {}) }),
          signal: ctrl.signal,
        })
        if (!res.ok) return setState({ status: 'error', issues: [], ok: true })
        setState(toPreflightState(await res.json()))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ status: 'error', issues: [], ok: true })
      }
    }, delayMs)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [trimmed, workspaceId, checkable, delayMs])

  return checkable ? state : IDLE
}
