'use client'

/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { Invite, Member, PendingInviteToken, Workspace } from './types'
import {
  buildInviteLink,
  isAdminRole,
  normalizeInviteEmail,
  normalizeWorkspaceName,
  resolveSelectedWorkspace,
  validateInvite,
  validateWorkspaceName,
} from './workspaceLogic'

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [selected, setSelected] = useState<Workspace | null>(null)
  const [pendingInviteToken, setPendingInviteToken] = useState<PendingInviteToken | null>(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [inviting, setInviting] = useState(false)

  // Only the latest in-flight request may write state, so fast workspace
  // switching cannot resurrect another workspace's members/invites.
  const listSeq = useRef(0)
  const detailsSeq = useRef(0)
  const selectedRef = useRef<Workspace | null>(null)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const loadDetails = useCallback(async (workspaceId: string) => {
    const seq = ++detailsSeq.current
    setLoadingDetails(true)
    setDetailsError(null)
    try {
      const [membersResponse, invitesResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/members`),
        fetch(`/api/workspaces/${workspaceId}/invites`),
      ])
      if (seq !== detailsSeq.current) return
      // If the user already moved to another workspace, drop this payload.
      if (selectedRef.current && selectedRef.current.id !== workspaceId) return
      if (membersResponse.ok) {
        setMembers(await membersResponse.json())
      } else {
        setMembers([])
        throw new Error('Could not load workspace members')
      }
      if (invitesResponse.ok) {
        setInvites(await invitesResponse.json())
      } else {
        // Non-admins cannot list invites (403) — that is not an error state.
        setInvites([])
      }
    } catch (err) {
      if (seq !== detailsSeq.current) return
      setMembers([])
      const message = err instanceof Error ? err.message : 'Could not load workspace details'
      setDetailsError(message)
      toast.error(message)
    } finally {
      if (seq === detailsSeq.current) setLoadingDetails(false)
    }
  }, [])

  const selectWorkspace = useCallback(
    async (workspace: Workspace) => {
      // A stale invite banner from another workspace must never linger.
      setPendingInviteToken(null)
      // Sync the ref here (event handler, not render) so the in-flight
      // details fetch is not mistaken for a stale workspace's payload.
      selectedRef.current = workspace
      setSelected(workspace)
      await loadDetails(workspace.id)
    },
    [loadDetails]
  )

  const load = useCallback(async () => {
    const seq = ++listSeq.current
    setLoadingWorkspaces(true)
    setWorkspacesError(null)
    try {
      const response = await fetch('/api/workspaces')
      if (seq !== listSeq.current) return
      if (!response.ok) throw new Error('Could not load workspaces')
      const data: Workspace[] = await response.json()
      if (seq !== listSeq.current) return
      setWorkspaces(data)
      const next = resolveSelectedWorkspace(selectedRef.current, data)
      // Only touch selection when it actually changed (initial load, created,
      // or left workspace) so we do not refetch details on every reload.
      if ((next?.id ?? null) !== (selectedRef.current?.id ?? null)) {
        setPendingInviteToken(null)
        selectedRef.current = next
        setSelected(next)
        if (next) await loadDetails(next.id)
      }
    } catch (err) {
      if (seq !== listSeq.current) return
      const message = err instanceof Error ? err.message : 'Could not load workspaces'
      setWorkspacesError(message)
      toast.error(message)
    } finally {
      if (seq === listSeq.current) setLoadingWorkspaces(false)
    }
  }, [loadDetails])

  useEffect(() => {
    void load()
  }, [load])

  async function createWorkspace(rawName: string): Promise<boolean> {
    const validationError = validateWorkspaceName(rawName)
    if (validationError) {
      toast.error(validationError)
      return false
    }
    const name = normalizeWorkspaceName(rawName)
    setCreatingWorkspace(true)
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not create workspace')
      toast.success(`Workspace “${name}” created!`)
      await load()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create workspace')
      return false
    } finally {
      setCreatingWorkspace(false)
    }
  }

  async function invite(rawEmail: string, role: string): Promise<boolean> {
    const current = selectedRef.current
    if (!current) return false
    const email = normalizeInviteEmail(rawEmail)
    const validationError = validateInvite(email, role, current.role)
    if (validationError) {
      toast.error(validationError)
      return false
    }
    setInviting(true)
    try {
      const response = await fetch(`/api/workspaces/${current.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not invite member')
      setPendingInviteToken({ email: data.email, token: data.token })
      toast.success(`Invitation created for ${data.email}`)
      await loadDetails(current.id)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not invite member')
      return false
    } finally {
      setInviting(false)
    }
  }

  async function revokeInvite(inviteId: string) {
    const current = selectedRef.current
    if (!current) return
    try {
      const response = await fetch(
        `/api/workspaces/${current.id}/invites?id=${encodeURIComponent(inviteId)}`,
        { method: 'DELETE' }
      )
      if (!response.ok) throw new Error('Revoke failed')
      toast.success('Invitation revoked')
      await loadDetails(current.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Revoke failed')
    }
  }

  async function changeRole(member: Member, role: string) {
    const current = selectedRef.current
    if (!current || role === member.role) return
    try {
      const response = await fetch(`/api/workspaces/${current.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, role }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not change role')
      toast.success(`${member.email} role updated to ${role}`)
      // Reload both the workspace list (own role may have changed) and the
      // member rows — load() alone leaves the table stale.
      await load()
      await loadDetails(current.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change role')
    }
  }

  async function removeMember(member: Member) {
    const current = selectedRef.current
    if (!current) return
    if (!window.confirm(`Remove ${member.email} from ${current.name}?`)) return
    try {
      const response = await fetch(
        `/api/workspaces/${current.id}/members?userId=${encodeURIComponent(member.id)}`,
        { method: 'DELETE' }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not remove member')
      toast.success('Team member removed')
      await load()
      await loadDetails(current.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove member')
    }
  }

  async function leaveWorkspace() {
    const current = selectedRef.current
    if (!current) return
    if (!window.confirm(`Leave ${current.name}? You will lose access to its links and analytics.`)) return
    try {
      const response = await fetch(`/api/workspaces/${current.id}/members`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not leave workspace')
      toast.success(`Left ${current.name}`)
      const remaining = workspaces.filter((workspace) => workspace.id !== current.id)
      setWorkspaces(remaining)
      const next = remaining[0] ?? null
      setPendingInviteToken(null)
      selectedRef.current = next
      setSelected(next)
      setMembers([])
      setInvites([])
      if (next) await loadDetails(next.id)
      else void load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not leave workspace')
    }
  }

  function inviteLink(token: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://quicklink.to'
    return buildInviteLink(base, token)
  }

  const isAdmin = isAdminRole(selected?.role)

  return {
    workspaces,
    members,
    invites,
    selected,
    pendingInviteToken,
    setPendingInviteToken,
    loadingWorkspaces,
    loadingDetails,
    workspacesError,
    detailsError,
    creatingWorkspace,
    inviting,
    isAdmin,
    load,
    loadDetails,
    selectWorkspace,
    createWorkspace,
    invite,
    revokeInvite,
    changeRole,
    removeMember,
    leaveWorkspace,
    inviteLink,
  }
}
