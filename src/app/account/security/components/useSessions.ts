'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { Session } from '@/app/account/security/components/session-utils'
import { buildRevokeBody } from '@/app/account/security/components/session-utils'

/** Owns session list state with abort/sequence guards and a revoke race guard. */
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const seqRef = useRef(0)
  const revokeBusy = useRef(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    const seq = seqRef.current + 1
    seqRef.current = seq
    setLoading(true)
    try {
      const response = await fetch('/api/auth/sessions', { signal })
      if (!response.ok) throw new Error('Could not load sessions')
      const data = await response.json()
      if (signal?.aborted || seqRef.current !== seq) return
      setSessions(data)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (signal?.aborted || seqRef.current !== seq) return
      toast.error(error instanceof Error ? error.message : 'Could not load sessions')
    } finally {
      if (!signal?.aborted && seqRef.current === seq) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote session list populates local state after mount
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  const revoke = useCallback(
    async (sessionId?: string) => {
      if (revokeBusy.current) return
      const trimmed = (sessionId ?? '').trim()
      revokeBusy.current = true
      setRevoking(trimmed || 'all')
      try {
        const response = await fetch('/api/auth/sessions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRevokeBody(trimmed || undefined)),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          toast.error(data?.error || 'Could not revoke sessions')
          return
        }
        toast.success(trimmed ? 'Session revoked' : `Revoked ${data?.revoked ?? 0} other sessions`)
        await load()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not revoke sessions')
      } finally {
        revokeBusy.current = false
        setRevoking(null)
      }
    },
    [load],
  )

  return { sessions, loading, revoking, load, revoke }
}
