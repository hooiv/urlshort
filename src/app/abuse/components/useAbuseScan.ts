'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractShortCode,
  getApiErrorMessage,
  parseScanResponse,
  validateScanInput,
  type ScanResult,
} from './abuse-logic'

/**
 * Owns the "Instant Safety Lookup" state. Aborts in-flight scans and
 * ignores stale responses so rapid submissions cannot overwrite newer
 * results (fetch race fix vs the previous inline implementation).
 */
export function useAbuseScan(onScanned?: (shortCode: string) => void) {
  const [scanInput, setScanInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const requestId = useRef(0)
  const onScannedRef = useRef(onScanned)
  useEffect(() => {
    onScannedRef.current = onScanned
  }, [onScanned])

  const handleScan = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const validationError = validateScanInput(scanInput)
      if (validationError) {
        const { default: toast } = await import('react-hot-toast')
        toast.error(validationError)
        return
      }
      const code = extractShortCode(scanInput)
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      const currentId = requestId.current + 1
      requestId.current = currentId
      setScanning(true)
      setScanResult(null)
      setScanError(null)
      try {
        const res = await fetch(`/api/links/${encodeURIComponent(code)}`, {
          signal: controller.signal,
        })
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) throw new Error(getApiErrorMessage(data, 'Link not found'))
        const parsed = parseScanResponse(data)
        if (!parsed) throw new Error('Unexpected scan response')
        if (requestId.current !== currentId) return
        setScanResult(parsed)
        onScannedRef.current?.(parsed.shortCode)
        const { default: toast } = await import('react-hot-toast')
        toast.success('Link scanned successfully')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (requestId.current !== currentId) return
        const message = err instanceof Error ? err.message : 'Scan failed'
        setScanError(message)
        const { default: toast } = await import('react-hot-toast')
        toast.error(message)
      } finally {
        if (requestId.current === currentId) {
          if (inFlight.current === controller) inFlight.current = null
          setScanning(false)
        }
      }
    },
    [scanInput],
  )

  const clearScan = useCallback(() => {
    inFlight.current?.abort()
    requestId.current += 1
    setScanResult(null)
    setScanError(null)
  }, [])

  return { scanInput, setScanInput, scanning, scanResult, scanError, handleScan, clearScan }
}
