'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Info, Shield } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { CreateWorkspaceForm } from './components/CreateWorkspaceForm'
import { InviteForm } from './components/InviteForm'
import { InviteLinkBanner } from './components/InviteLinkBanner'
import { MemberList } from './components/MemberList'
import { PendingInvites } from './components/PendingInvites'
import { RoleMatrix } from './components/RoleMatrix'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { useWorkspaces } from './components/useWorkspaces'
import { canInviteAdmin } from './components/workspaceLogic'

export default function WorkspacesPage() {
  const {
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
  } = useWorkspaces()
  const [showRoleInfo, setShowRoleInfo] = useState(false)

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
        {showRoleInfo && <RoleMatrix onClose={() => setShowRoleInfo(false)} />}

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Workspace Switcher Sidebar */}
          <aside className="space-y-6">
            <WorkspaceSidebar
              workspaces={workspaces}
              selectedId={selected?.id ?? null}
              loading={loadingWorkspaces}
              error={workspacesError}
              onSelect={(workspace) => void selectWorkspace(workspace)}
              onRetry={() => void load()}
              form={<CreateWorkspaceForm busy={creatingWorkspace} onCreate={createWorkspace} />}
            />
          </aside>

          {/* Active Workspace Console */}
          {selected ? (
            <div className="space-y-6">
              {/* Workspace Header Banner */}
              <WorkspaceHeader
                workspace={selected}
                memberCount={members.length}
                onLeave={() => void leaveWorkspace()}
              />

              {/* Pending Invite Link Ready Alert */}
              {pendingInviteToken && (
                <InviteLinkBanner
                  pending={pendingInviteToken}
                  inviteLink={inviteLink}
                  onDismiss={() => setPendingInviteToken(null)}
                />
              )}

              {/* Team Members List */}
              <MemberList
                members={members}
                isAdmin={isAdmin}
                loading={loadingDetails}
                error={detailsError}
                onRoleChange={(member, role) => void changeRole(member, role)}
                onRemove={(member) => void removeMember(member)}
                onRetry={() => void loadDetails(selected.id)}
              />

              {/* Pending Invitations */}
              <PendingInvites invites={invites} onRevoke={(id) => void revokeInvite(id)} />

              {/* Invite New Team Member Form */}
              {isAdmin && (
                <InviteForm
                  busy={inviting}
                  canInviteAdmin={canInviteAdmin(selected.role)}
                  onInvite={invite}
                />
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-16 text-center text-sm text-slate-500">
              {loadingWorkspaces ? 'Loading workspaces…' : 'Select or create a workspace to manage team members.'}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
