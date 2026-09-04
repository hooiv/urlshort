/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { computeProbeStats, readManageToken, readProbeResult } from './healthStats'
import type { HealthData, ProbeStats } from './types'

/**
 * Reliability data + probe actions for one short link.
 *
 * Keeps every API call shape identical to the original page:
 * GET /health, POST /health { target }, PATCH /health { autoFailoverEnabled }.
 */
export function useHealth(shortCode: string) {
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    setToken(readManageToken(shortCode))
  }, [shortCode])

  const load = useCallback(async () => {
    if (!token) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/health`, {
        headers: { 'x-management-token': token || '' },
        signal: controller.signal,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load reliability data')
      if (mountedRef.current && abortRef.current === controller) setData(payload as HealthData)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(error instanceof Error ? error.message : 'Unable to load reliability data')
    } finally {
      if (mountedRef.current && abortRef.current === controller) setLoading(false)
    }
  }, [shortCode, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  /** Probe one target and surface the per-probe toast. No refetch — callers decide when to reload. */
  const probe = useCallback(
    async (target: string) => {
      if (!token) return
      setChecking(target)
      try {
        const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/health`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-management-token': token },
          body: JSON.stringify({ target }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Health check failed')
        const result = readProbeResult(payload)
        toast.success(
          result.status === 'down'
            ? `Destination is DOWN (HTTP ${result.statusCode || 'Error'})`
            : `Destination healthy (${result.latencyMs}ms, HTTP ${result.statusCode})`
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Health check failed')
      } finally {
        if (mountedRef.current) setChecking(null)
      }
    },
    [shortCode, token]
  )

  const check = useCallback(
    async (target: string) => {
      await probe(target)
      await load()
    },
    [probe, load]
  )

  /** Sweep the fallback plus every enabled rule, then reload once (not once per probe). */
  const checkAll = useCallback(async () => {
    if (!token || !data || checkingAll) return
    setCheckingAll(true)
    try {
      await probe('fallback')
      for (const rule of data.rules.filter((r) => r.enabled)) {
        await probe(rule.id)
      }
      toast.success('Swept all routing endpoints')
    } catch {
      // Individual probe errors are already toasted in probe().
    } finally {
      if (mountedRef.current) setCheckingAll(false)
      await load()
    }
  }, [token, data, checkingAll, probe, load])

  const toggleFailover = useCallback(async () => {
    if (!token || !data) return
    const enabled = !data.url.autoFailoverEnabled
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/health`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ autoFailoverEnabled: enabled }),
      })
      const payload = await response.json()
      if (!response.ok) {
        toast.error(payload.error || 'Could not update failover setting')
        return
      }
      if (mountedRef.current) setData({ ...data, url: { ...data.url, autoFailoverEnabled: enabled } })
      toast.success(enabled ? 'Automatic failover enabled' : 'Automatic failover paused')
    } catch {
      toast.error('Could not update failover setting')
    }
  }, [shortCode, token, data])

  const probeStats: ProbeStats | null = useMemo(() => {
    if (!data || !data.checks.length) return null
    return computeProbeStats(data.checks)
  }, [data])

  return { token, data, loading, checking, checkingAll, probeStats, load, check, checkAll, toggleFailover }
}
