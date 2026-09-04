/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getInvalidTokenError,
  getMissingTokenError,
  isValidVerifyToken,
  type VerifyStatus,
} from '@/app/verify-email/components/verify-logic'

export function useVerifyEmail(token: string) {
  const router = useRouter()
  const [status, setStatus] = useState<VerifyStatus>('verifying')
  const [error, setError] = useState<string | null>(null)
  const attemptedToken = useRef<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError(getMissingTokenError())
      return
    }
    if (!isValidVerifyToken(token)) {
      setStatus('error')
      setError(getInvalidTokenError())
      return
    }
    // Guard against React StrictMode double-invoking effects in development,
    // which would otherwise POST the single-use token twice.
    if (attemptedToken.current === token) return
    attemptedToken.current = token

    const controller = new AbortController()
    let redirectTimer: ReturnType<typeof setTimeout> | undefined
    setStatus('verifying')
    setError(null)

    fetch('/api/auth/verify/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Verification failed')
        setStatus('success')
        redirectTimer = setTimeout(() => router.push('/account'), 2000)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        attemptedToken.current = null
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Verification failed')
      })

    return () => {
      controller.abort()
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [token, router])

  return { status, error }
}
