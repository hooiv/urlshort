'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import type { ApiKeyRow } from '@/app/account/components/types'
import { validateApiKeyName } from '@/app/account/components/account-utils'

function splitIps(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean)
}

/** Owns API-key list state. The full secret only ever lives in `createdKey` until dismissed. */
export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [newKeyIps, setNewKeyIps] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['*'])
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState(0)
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
          body: JSON.stringify({ name: newKeyName.trim(), allowedIps: splitIps(newKeyIps),
            scopes: newKeyScopes.length ? newKeyScopes : ['*'],
            ...(newKeyExpiryDays > 0 ? { expiresInDays: newKeyExpiryDays } : {}),
          }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not create key')
        setCreatedKey(data.key)
        setNewKeyName('')
        setNewKeyIps('')
        await loadKeys()
        toast.success("API key created — copy it now, it won't be shown again")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not create key')
      } finally {
        setBusy(false)
      }
    },
    [newKeyName, newKeyIps, newKeyScopes, newKeyExpiryDays, loadKeys],
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

  const editAllowlist = useCallback(
    async (id: string, current: string[]) => {
      if (typeof window === 'undefined') return
      const input = window.prompt('Allowed IPs or CIDR ranges, comma separated (blank = any address):', current.join(', '))
      if (input === null) return
      try {
        const response = await fetch('/api/account/api-keys', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, allowedIps: splitIps(input) }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not update allowlist')
        toast.success('Allowlist updated')
        await loadKeys()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update allowlist')
      }
    },
    [loadKeys],
  )

  const rotateKey = useCallback(
    async (id: string) => {
      if (typeof window === 'undefined') return
      const input = window.prompt('Keep the old key working for how many hours? (0 = revoke now, max 168)', '24')
      if (input === null) return
      const graceHours = Number(input.trim())
      if (!Number.isInteger(graceHours) || graceHours < 0 || graceHours > 168) return toast.error('Enter a whole number from 0 to 168')
      try {
        const response = await fetch('/api/account/api-keys/rotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, graceHours }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not rotate key')
        setCreatedKey(data.key)
        await loadKeys()
        toast.success('Replacement key issued — copy it now')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not rotate key')
      }
    },
    [loadKeys],
  )

  const dismissCreatedKey = useCallback(() => {
    setCreatedKey(null)
  }, [])

  return { rotateKey, newKeyScopes, setNewKeyScopes, newKeyExpiryDays, setNewKeyExpiryDays, keys, newKeyName, setNewKeyName, newKeyIps, setNewKeyIps, editAllowlist, createdKey, busy, createKey, revokeKey, dismissCreatedKey }
}
