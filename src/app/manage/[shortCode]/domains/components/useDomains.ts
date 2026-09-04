/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import {
  manageTokenKey,
  readSessionToken,
  validateDomainForm,
} from './domainValidation'
import type { ApiResponse, Binding, DnsRecords } from './types'

/**
 * Branded-domain bindings + DNS verify flow for one short link.
 *
 * API call shapes are unchanged: GET/POST/PATCH/DELETE on
 * /api/links/[shortCode]/domains with the management token header.
 */
export function useDomains(shortCode: string) {
  const [token, setToken] = useState<string | null>(null)
  const [host, setHost] = useState('')
  const [path, setPath] = useState('/')
  const [bindings, setBindings] = useState<Binding[]>([])
  const [dns, setDns] = useState<DnsRecords | null>(null)
  const [working, setWorking] = useState(false)
  const mountedRef = useRef(true)
  const pathTouchedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setToken(readSessionToken(manageTokenKey(shortCode)))
  }, [shortCode])

  // Default the backhalf to the short code without clobbering user edits
  // (guards the first-render `/${shortCode}` when the param is not ready yet).
  useEffect(() => {
    if (shortCode && !pathTouchedRef.current) setPath(`/${shortCode}`)
  }, [shortCode])

  const load = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        headers: { 'x-management-token': token },
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Could not load domains')
        return
      }
      if (mountedRef.current) setBindings(data as Binding[])
    } catch {
      toast.error('Network error loading domain bindings')
    }
  }, [shortCode, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  async function addDomain(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    const checked = validateDomainForm(host, path)
    if (!checked.ok) {
      toast.error(checked.error)
      return
    }
    setWorking(true)
    setDns(null)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ host: checked.host, path: checked.path }),
      })
      const data = (await response.json()) as ApiResponse
      if (!response.ok) throw new Error((data as unknown as { error?: string }).error || 'Could not add domain')

      if (!data.verified) {
        if (mountedRef.current) setDns(data.dns || null)
        toast.success('Domain registered; publish the DNS records below to verify ownership')
      } else {
        await load()
        toast.success('Branded domain connected and verified')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add domain')
    } finally {
      if (mountedRef.current) setWorking(false)
    }
  }

  async function verify() {
    if (!token) return
    const checked = validateDomainForm(host, path)
    if (!checked.ok) {
      toast.error(checked.error)
      return
    }
    setWorking(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ host: checked.host, path: checked.path }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'DNS verification check failed')
      await load()
      if (mountedRef.current) setDns(null)
      toast.success('Domain ownership verified! Your branded link is active.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification failed')
    } finally {
      if (mountedRef.current) setWorking(false)
    }
  }

  async function remove(binding: Binding) {
    if (!token || !window.confirm(`Remove ${binding.domain.host}${binding.path}?`)) return
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/domains`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ host: binding.domain.host, path: binding.path }),
      })
      if (!response.ok) {
        let message = 'Could not remove domain'
        try {
          const failure = (await response.json()) as { error?: string }
          if (failure?.error) message = failure.error
        } catch {
          // Non-JSON error body — keep the default message.
        }
        toast.error(message)
        return
      }
      await load()
      toast.success('Branded domain binding removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove domain')
    }
  }

  function handleHostChange(value: string) {
    setHost(value)
  }

  function handlePathChange(value: string) {
    pathTouchedRef.current = true
    setPath(value)
  }

  return { token, host, path, bindings, dns, working, handleHostChange, handlePathChange, load, addDomain, verify, remove }
}
