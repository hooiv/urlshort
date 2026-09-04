'use client'
import { useEffect } from 'react'
import { SERVICE_WORKER_URL, canUseServiceWorker } from '@/components/service-worker-logic'

export function ServiceWorkerRegister() {
  useEffect(() => {
    try {
      if (typeof navigator === 'undefined') return
      if (!canUseServiceWorker('serviceWorker' in navigator)) return
      const result = navigator.serviceWorker.register(SERVICE_WORKER_URL)
      if (result && typeof result.catch === 'function') result.catch(() => undefined)
    } catch {
      // Graceful: SW unsupported, blocked, or insecure context — app works without it.
    }
  }, [])
  return null
}
