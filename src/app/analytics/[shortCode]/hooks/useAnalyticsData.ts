'use client'
/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalyticsData } from '../components/types'

export function useAnalyticsData(
  shortCode: string | undefined,
  range: string,
  country: string | null,
  device: string | null,
  referrer: string | null,
  autoRefresh: boolean
) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Monotonic request sequence: only the latest response may touch state.
  // Combined with per-request AbortControllers this closes the race where a
  // slow earlier range/filter selection overwrites newer results.
  const sequenceRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(
    async (isBackground = false) => {
      if (!shortCode) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const sequence = ++sequenceRef.current
      if (!isBackground) setLoading(true)
      try {
        const params = new URLSearchParams({ range })
        if (country) params.set('country', country)
        if (device) params.set('device', device)
        if (referrer) params.set('referrer', referrer)

        const response = await fetch(`/api/analytics/${encodeURIComponent(shortCode)}?${params}`, {
          signal: controller.signal,
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load analytics')
        if (sequence !== sequenceRef.current) return
        setData(payload)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return
        if (!isBackground) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics')
        }
      } finally {
        if (!isBackground && sequence === sequenceRef.current) setLoading(false)
      }
    },
    [shortCode, range, country, device, referrer]
  )

  useEffect(() => {
    void fetchAnalytics(false)
  }, [fetchAnalytics])

  useEffect(() => {
    return () => {
      sequenceRef.current += 1
      abortRef.current?.abort()
    }
  }, [])

  // Live event stream: analytics refreshes when the backend emits an event,
  // rather than polling on an interval.
  useEffect(() => {
    if (!autoRefresh || typeof EventSource === 'undefined') return
    const source = new EventSource('/api/events/stream')
    const onEvent = () => void fetchAnalytics(true)
    source.addEventListener('click.batch', onEvent)
    source.addEventListener('conversion.created', onEvent)
    source.addEventListener('campaign.updated', onEvent)
    return () => {
      source.removeEventListener('click.batch', onEvent)
      source.removeEventListener('conversion.created', onEvent)
      source.removeEventListener('campaign.updated', onEvent)
      source.close()
    }
  }, [autoRefresh, fetchAnalytics])

  return { data, error, loading, refetch: fetchAnalytics }
}
