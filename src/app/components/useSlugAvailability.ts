'use client'

import { useEffect, useState } from 'react'

export type SlugAvailability = {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid' | 'error'
  alternatives: string[]
}

const IDLE: SlugAvailability = { status: 'idle', alternatives: [] }

/** Maps one /api/slug-availability result row to UI state. Pure, unit-tested. */
export function toAvailability(row: { status?: string; alternatives?: string[] } | undefined): SlugAvailability {
  if (!row) return { status: 'error', alternatives: [] }
  const s = row.status
  if (s === 'available' || s === 'taken' || s === 'reserved' || s === 'invalid') {
    return { status: s, alternatives: Array.isArray(row.alternatives) ? row.alternatives.slice(0, 5) : [] }
  }
  return { status: 'error', alternatives: [] }
}

/** Debounced availability check for a custom backhalf; aborts stale requests. */
export function useSlugAvailability(code: string, delayMs = 350): SlugAvailability {
  const trimmed = code.trim()
  const [state, setState] = useState<SlugAvailability>(IDLE)

  useEffect(() => {
    if (!trimmed) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setState({ status: 'checking', alternatives: [] })
      try {
        const res = await fetch('/api/slug-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: [trimmed] }),
          signal: ctrl.signal,
        })
        if (!res.ok) return setState({ status: 'error', alternatives: [] })
        const data = await res.json()
        setState(toAvailability(data?.results?.[0]))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ status: 'error', alternatives: [] })
      }
    }, delayMs)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [trimmed, delayMs])

  return trimmed ? state : IDLE
}
