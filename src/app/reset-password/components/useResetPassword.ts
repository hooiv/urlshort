'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { getResetSubmitError } from '@/app/reset-password/components/reset-logic'

export function useResetPassword(token: string) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const inFlight = useRef<AbortController | null>(null)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) toast.error('Missing reset token — use the link from your email')
  }, [token])

  useEffect(() => {
    return () => {
      inFlight.current?.abort()
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (busy) return
      const validationError = getResetSubmitError(token, password, confirm)
      if (validationError) {
        toast.error(validationError)
        return
      }
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setBusy(true)
      try {
        const response = await fetch('/api/auth/reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not reset password')
        setDone(true)
        toast.success('Password reset — sign in with your new password')
        redirectTimer.current = setTimeout(() => router.push('/account'), 1500)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        toast.error(error instanceof Error ? error.message : 'Could not reset password')
      } finally {
        if (inFlight.current === controller) inFlight.current = null
        setBusy(false)
      }
    },
    [busy, confirm, password, router, token],
  )

  return { password, setPassword, confirm, setConfirm, busy, done, submit }
}
