'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import type { ApiKeyRow } from '@/app/account/components/types'
import { validateApiKeyName } from '@/app/account/components/account-utils'

/** Owns API-key list state. The full secret only ever lives in `createdKey` until dismissed. */
export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seqRef = useRef(0)

  const loadKeys = useCallback(async () => {
    const seq = seqRef.current + 1
    seqRef.current = seq
    try {
      const response = await fetch('/api/account/api-keys')
      if (!response.ok) return
      const data = await response.json()
      if (seqRef.current === seq) setKeys(data)
    } catch {
      /* non-critical */
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote key list populates local state after mount
    void loadKeys()
  }, [loadKeys])

  const createKey = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const error = validateApiKeyName(newKeyName)
      if (error) return toast.error(error)
      setBusy(true)
      try {
        const response = await fetch('/api/account/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newKeyName.trim() }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not create key')
        setCreatedKey(data.key)
        setNewKeyName('')
        await loadKeys()
        toast.success("API key created — copy it now, it won't be shown again")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not create key')
      } finally {
        setBusy(false)
      }
    },
    [newKeyName, loadKeys],
  )

  const revokeKey = useCallback(
    async (id: string) => {
      if (typeof window !== 'undefined') {
        if (!window.confirm('Revoke this API key? Applications using it will immediately lose access.')) return
      }
      try {
        const response = await fetch(`/api/account/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!response.ok) throw new Error('Revoke failed')
        toast.success('API key revoked')
        await loadKeys()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Revoke failed')
      }
    },
    [loadKeys],
  )

  const dismissCreatedKey = useCallback(() => {
    setCreatedKey(null)
  }, [])

  return { keys, newKeyName, setNewKeyName, createdKey, busy, createKey, revokeKey, dismissCreatedKey }
}
