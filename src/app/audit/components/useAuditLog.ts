'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildAuditQuery,
  getAuditErrorMessage,
  parseAuditResponse,
  type AuditEvent,
} from './audit-logic'

/**
 * Owns audit-log fetching: search state, loading/error states, and
 * abort + request-id guards so rapid searches cannot overwrite newer
 * results. Parses both the current `{ items }` envelope and legacy arrays.
 */
export function useAuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async (query: string) => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    const currentId = requestId.current + 1
    requestId.current = currentId
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/account/audit${buildAuditQuery(query)}`, {
        signal: controller.signal,
      })
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) throw new Error(getAuditErrorMessage(data, 'Could not load audit history'))
      if (requestId.current !== currentId) return
      setEvents(parseAuditResponse(data))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (requestId.current !== currentId) return
      setEvents([])
      setError(err instanceof Error ? err.message : 'Could not load audit history')
    } finally {
      if (requestId.current === currentId) {
        if (inFlight.current === controller) inFlight.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Initial fetch synchronizes remote audit state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load('')
    return () => {
      inFlight.current?.abort()
    }
  }, [load])

  const reload = useCallback(() => load(search), [load, search])

  return { events, search, setSearch, loading, error, reload }
}
