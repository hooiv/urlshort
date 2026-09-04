'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildUnlockPath, buildVerifyUrl } from '@/app/protected/[shortCode]/components/protected-logic'

export function useVerifyPassword(shortCode: string) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => inFlight.current?.abort()
  }, [])

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!shortCode || loading) return
      setError('')
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setLoading(true)
      try {
        const res = await fetch(buildVerifyUrl(shortCode), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          signal: controller.signal,
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Incorrect password')
        router.push(buildUnlockPath(shortCode))
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        if (inFlight.current === controller) inFlight.current = null
        setLoading(false)
      }
    },
    [loading, password, router, shortCode],
  )

  return { password, setPassword, error, loading, submit }
}
