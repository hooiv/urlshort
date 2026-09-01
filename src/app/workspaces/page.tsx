/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  LogOut,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface Workspace {
  id: string
  name: string
  slug: string
  role: string
}

interface Member {
  id: string
  membershipId: string
  email: string
  name: string | null
  role: string
}

interface Invite {
  id: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
}

const ROLES = ['viewer', 'analyst', 'editor', 'admin'] as const

const ROLE_PERMISSIONS: Record<string, string> = {
  owner: 'Full workspace ownership, billing, domain management, and member administration.',
  admin: 'Invite and manage team members, configure custom domains, edit all links and rules.',
  editor: 'Create, modify, and delete short links, routing rules, experiments, and QR codes.',
  analyst: 'View real-time analytics, statistical A/B test results, and export CSV reports.',
  viewer: 'Read-only access to campaign analytics and link metadata.',
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [selected, setSelected] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [pendingInviteToken, setPendingInviteToken] = useState<{ email: string; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showRoleInfo, setShowRoleInfo] = useState(false)

  const loadInvites = useCallback(async (workspaceId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invites`)
      if (response.ok) setInvites(await response.json())
      else setInvites([])
    } catch {
      setInvites([])
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspaces')
      if (!response.ok) return
      const data: Workspace[] = await response.json()
      setWorkspaces(data)
      setSelected((current) => data.find((w) => w.id === current?.id) ?? data[0] ?? null)
    } catch {
      toast.error('Could not load workspaces')
    }
  }, [])

  const selectWorkspace = useCallback(
    async (workspace: Workspace) => {
      setSelected(workspace)
      try {
        const membersResponse = await fetch(`/api/workspaces/${workspace.id}/members`)
        if (membersResponse.ok) setMembers(await membersResponse.json())
        await loadInvites(workspace.id)
      } catch {
        toast.error('Could not load workspace details')
      }
    },
    [loadInvites]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (selected) void selectWorkspace(selected)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not create workspace')
      setName('')
      toast.success(`Workspace “${name}” created!`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create workspace')
    } finally {
      setBusy(false)
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    try {
      const response = await fetch(`/api/workspaces/${selected.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not invite member')
      setInviteEmail('')
      setPendingInviteToken({ email: data.email, token: data.token })
      toast.success(`Invitation created for ${data.email}`)
      await loadInvites(selected.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not invite member')
    } finally {
      setBusy(false)
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!selected) return
    try {
      const response = await fetch(
        `/api/workspaces/${selected.id}/invites?id=${encodeURIComponent(inviteId)}`,
        { method: 'DELETE' }
      )
      if (!response.ok) throw new Error('Revoke failed')
      toast.success('Invitation revoked')
      await loadInvites(selected.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Revoke failed')
    }
  }

  async function changeRole(member: Member, role: string) {
    if (!selected || role === member.role) return
    try {
      const response = await fetch(`/api/workspaces/${selected.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, role }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not change role')
      toast.success(`${member.email} role updated to ${role}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change role')
    }
  }

  async function removeMember(member: Member) {
    if (!selected) return
    if (!window.confirm(`Remove ${member.email} from ${selected.name}?`)) return
    try {
      const response = await fetch(
        `/api/workspaces/${selected.id}/members?userId=${encodeURIComponent(member.id)}`,
        { method: 'DELETE' }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not remove member')
      toast.success('Team member removed')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove member')
    }
  }

  async function leaveWorkspace() {
    if (!selected) return
    if (!window.confirm(`Leave ${selected.name}? You will lose access to its links and analytics.`)) return
    try {
      const response = await fetch(`/api/workspaces/${selected.id}/members`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not leave workspace')
      toast.success(`Left ${selected.name}`)
      setSelected(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not leave workspace')
    }
  }

  function inviteLink(token: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://quicklink.to'
    return `${base}/account?invite=${encodeURIComponent(token)}`
  }

  const isAdmin = selected?.role === 'owner' || selected?.role === 'admin'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              title="Return to Account"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-white">Workspaces & Team Governance</span>
              </div>
              <p className="text-xs text-slate-500">Collaborate with granular role-based access control</p>
            </div>
          </div>

          <button
            onClick={() => setShowRoleInfo(!showRoleInfo)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-white"
          >
            <Info className="h-3.5 w-3.5" /> Role Matrix
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Role Matrix Explanation Banner */}
        {showRoleInfo && (
          <section className="mb-8 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
                <ShieldCheck className="h-4 w-4" /> Role Permissions Matrix
              </div>
              <button onClick={() => setShowRoleInfo(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(ROLE_PERMISSIONS).map(([role, desc]) => (
                <div key={role} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                  <div className="font-mono text-xs font-bold uppercase tracking-wide text-white mb-1">
                    {role}
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Workspace Switcher Sidebar */}
          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>Your Workspaces</span>
                <span className="font-mono">{workspaces.length}</span>
              </div>

              <div className="space-y-1.5">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => void selectWorkspace(workspace)}
                    className={`w-full flex flex-col items-start rounded-xl p-3 text-left transition ${
                      selected?.id === workspace.id
                        ? 'border border-blue-500/40 bg-blue-500/10 text-white shadow-sm'
                        : 'border border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-950 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-sm truncate">{workspace.name}</span>
                      <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blue-300">
                        {workspace.role}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 mt-0.5">{workspace.slug}</span>
                  </button>
                ))}
              </div>

              {/* Create Workspace Form */}
              <form onSubmit={createWorkspace} className="space-y-2 border-t border-slate-800 pt-4">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="New workspace name…"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                />
                <button
                  disabled={busy || !name.trim()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 py-2 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-50 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Create Workspace
                </button>
              </form>
            </div>
          </aside>

          {/* Active Workspace Console */}
          {selected ? (
            <div className="space-y-6">
              {/* Workspace Header Banner */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-2xl font-bold text-white">{selected.name}</h1>
                      <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 font-mono text-xs text-blue-300">
                        /{selected.slug}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Your permissions: <span className="font-semibold text-white uppercase">{selected.role}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-300">
                      <Users className="h-3.5 w-3.5 text-blue-400" />
                      <span>{members.length} Member{members.length === 1 ? '' : 's'}</span>
                    </div>
                    {selected.role !== 'owner' && (
                      <button
                        onClick={() => void leaveWorkspace()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                      >
                        <LogOut className="h-3 w-3" /> Leave
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Pending Invite Link Ready Alert */}
              {pendingInviteToken && (
                <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> 1-Click Invitation Link Ready
                      </div>
                      <p className="mt-1 text-xs text-emerald-200/80">
                        Share this private link with <span className="font-semibold">{pendingInviteToken.email}</span>.
                      </p>
                    </div>
                    <button
                      onClick={() => setPendingInviteToken(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-emerald-300">
                      {inviteLink(pendingInviteToken.token)}
                    </code>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteLink(pendingInviteToken.token))
                          toast.success('Invitation link copied!')
                        } catch {
                          toast.error('Clipboard copy failed')
                        }
                      }}
                      className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-400 transition"
                    >
                      Copy Link
                    </button>
                  </div>
                </section>
              )}

              {/* Team Members List */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-white">Team Members</h2>
                    <p className="text-xs text-slate-400">Individuals with collaborative access to this workspace</p>
                  </div>
                </div>

                <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
                  {members.map((member) => {
                    const initials = (member.name || member.email)
                      .slice(0, 2)
                      .toUpperCase()

                    return (
                      <div key={member.id} className="flex items-center justify-between p-4 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-slate-200 truncate">
                              {member.name || member.email}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{member.email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isAdmin && member.role !== 'owner' ? (
                            <select
                              value={member.role}
                              onChange={(e) => void changeRole(member, e.target.value)}
                              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 outline-none focus:border-blue-500"
                            >
                              {ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-slate-400">
                              {member.role}
                            </span>
                          )}

                          {isAdmin && member.role !== 'owner' && (
                            <button
                              onClick={() => void removeMember(member)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                              title="Remove member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Pending Invitations */}
              {invites.length > 0 && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
                  <h2 className="font-semibold text-white text-sm">Pending Invitations</h2>
                  <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-4">
                        <div>
                          <div className="font-medium text-xs text-slate-200">{inv.email}</div>
                          <div className="text-[11px] text-slate-500">
                            Role: <span className="uppercase font-semibold">{inv.role}</span> · Expires:{' '}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </div>
                        </div>

                        <button
                          onClick={() => void revokeInvite(inv.id)}
                          className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Invite New Team Member Form */}
              {isAdmin && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                  <div className="flex items-center gap-2 font-semibold text-white text-sm mb-1">
                    <UserPlus className="h-4 w-4 text-blue-400" />
                    <span>Invite Teammates</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Send an invitation link with assigned workspace permissions.
                  </p>

                  <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                    <input
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500"
                    />

                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="viewer">Viewer (Read-only)</option>
                      <option value="analyst">Analyst (Stats & Export)</option>
                      <option value="editor">Editor (Create & Edit)</option>
                      {selected.role === 'owner' && <option value="admin">Admin (Full Team)</option>}
                    </select>

                    <button
                      disabled={busy}
                      className="rounded-xl bg-blue-500 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
                    >
                      {busy ? 'Generating…' : 'Create Invite'}
                    </button>
                  </form>
                </section>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-16 text-center text-sm text-slate-500">
              Select or create a workspace to manage team members.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
