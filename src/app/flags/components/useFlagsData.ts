/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  buildWorkspaceFlagsUrl,
  buildWorkspacesUrl,
  clampRolloutPercent,
  getFlagSaveError,
  normalizeFlagKey,
  type WorkspaceFlag,
  type WorkspaceOption,
} from '@/app/flags/components/flags-logic'

async function readJson<T>(response: Response, fallback: T): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return fallback
  }
}

export function useFlagsData() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [selected, setSelected] = useState('')
  const [flags, setFlags] = useState<WorkspaceFlag[]>([])
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [flagsError, setFlagsError] = useState<string | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [loadingFlags, setLoadingFlags] = useState(false)
  const [key, setKey] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [rollout, setRollout] = useState(100)
  const [busy, setBusy] = useState(false)
  const flagsRequestId = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoadingWorkspaces(true)
    setWorkspacesError(null)
    fetch(buildWorkspacesUrl(), { signal: controller.signal })
      .then(async (response) => {
        const data = await readJson<WorkspaceOption[]>(response, [])
        if (!response.ok) throw new Error('Could not load workspaces')
        if (controller.signal.aborted) return
        setWorkspaces(Array.isArray(data) ? data : [])
        setSelected((current) => current || data[0]?.id || '')
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setWorkspacesError(error instanceof Error ? error.message : 'Could not load workspaces')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWorkspaces(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!selected) {
      setFlags([])
      return
    }
    const requestId = (flagsRequestId.current += 1)
    const controller = new AbortController()
    setLoadingFlags(true)
    setFlagsError(null)
    fetch(buildWorkspaceFlagsUrl(selected), { signal: controller.signal })
      .then(async (response) => {
        const data = await readJson<WorkspaceFlag[]>(response, [])
        if (!response.ok) throw new Error('Could not load flags')
        if (controller.signal.aborted || flagsRequestId.current !== requestId) return
        setFlags(Array.isArray(data) ? data : [])
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (flagsRequestId.current !== requestId) return
        setFlagsError(error instanceof Error ? error.message : 'Could not load flags')
      })
      .finally(() => {
        if (!controller.signal.aborted && flagsRequestId.current === requestId) setLoadingFlags(false)
      })
    return () => controller.abort()
  }, [selected])

  const save = useCallback(async () => {
    const validationError = getFlagSaveError(selected, key)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setBusy(true)
    try {
      const response = await fetch(buildWorkspaceFlagsUrl(selected), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: normalizeFlagKey(key),
          enabled,
          rolloutPercent: clampRolloutPercent(rollout),
          config: {},
        }),
      })
      if (!response.ok) {
        const data = await readJson<{ error?: string }>(response, {})
        throw new Error(data.error || 'Could not save flag')
      }
      toast.success('Flag saved')
      const next = await fetch(buildWorkspaceFlagsUrl(selected))
      setFlags(await readJson<WorkspaceFlag[]>(next, []))
      setKey('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }, [enabled, key, rollout, selected])

  return {
    workspaces,
    selected,
    setSelected,
    flags,
    workspacesError,
    flagsError,
    loadingWorkspaces,
    loadingFlags,
    key,
    setKey,
    enabled,
    setEnabled,
    rollout,
    setRollout,
    busy,
    save,
  }
}
