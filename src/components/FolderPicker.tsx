'use client'

import { useEffect, useState } from 'react'

export type FolderOption = { id: string; name: string; restricted: boolean; role: string | null }
const WRITE = ['owner', 'admin', 'editor']

/** Folders in a workspace the current user can file links into. Cached per workspace for the page's lifetime. */
const cache = new Map<string, Promise<FolderOption[]>>()
export function useWritableFolders(workspaceId: string | null | undefined): FolderOption[] {
  const [folders, setFolders] = useState<FolderOption[]>([])
  useEffect(() => {
    if (!workspaceId) return
    let active = true
    let pending = cache.get(workspaceId)
    if (!pending) {
      pending = fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/folders`)
        .then((res) => (res.ok ? res.json() : { folders: [] }))
        .then((body: { folders?: FolderOption[] }) => (body.folders ?? []).filter((f) => f.role && WRITE.includes(f.role)))
        .catch(() => [])
      cache.set(workspaceId, pending)
    }
    void pending.then((rows) => { if (active) setFolders(rows) })
    return () => { active = false }
  }, [workspaceId])
  return workspaceId ? folders : []
}

export function invalidateFolderCache(workspaceId?: string) {
  if (workspaceId) cache.delete(workspaceId)
  else cache.clear()
}
