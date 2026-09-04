'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import AccountHeader from '@/app/account/components/AccountHeader'
import ActivitySection from '@/app/account/components/ActivitySection'
import ApiKeysSection from '@/app/account/components/ApiKeysSection'
import AuthForm from '@/app/account/components/AuthForm'
import InviteBanner from '@/app/account/components/InviteBanner'
import LinksSection from '@/app/account/components/LinksSection'
import SummaryStats from '@/app/account/components/SummaryStats'
import VerifyEmailBanner from '@/app/account/components/VerifyEmailBanner'
import { useAccountData } from '@/app/account/components/useAccountData'
import { extractInvitedEmail } from '@/app/account/components/account-utils'

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <AccountPageInner />
    </Suspense>
  )
}

function AccountPageInner() {
  const params = useSearchParams()
  const inviteToken = params.get('invite')
  const invitedEmail = extractInvitedEmail(params.toString())
  const account = useAccountData(inviteToken)

  if (account.loading && !account.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
        Loading account…
      </div>
    )
  }

  if (!account.user) {
    return <AuthForm inviteToken={inviteToken} invitedEmail={invitedEmail} onSignedIn={account.handleSignedIn} />
  }

  const user = account.user

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />
      <AccountHeader onLogout={() => void account.logout()} />
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <section>
          <p className="text-sm text-blue-300">Account</p>
          <h1 className="mt-1 text-3xl font-semibold">{user.name || user.email}</h1>
          <p className="mt-2 text-sm text-slate-500">{user.email}</p>
        </section>
        <SummaryStats links={account.links} />
        <InviteBanner
          inviteToken={inviteToken}
          inviteState={account.inviteState}
          inviteError={account.inviteError}
        />
        <VerifyEmailBanner user={user} />
        <ApiKeysSection />
        <LinksSection
          links={account.links}
          search={account.search}
          activeTag={account.activeTag}
          nextCursor={account.nextCursor}
          onSearchChange={(query) => void account.searchLinks(query, account.activeTag || undefined)}
          onSelectTag={(tag) => {
            account.setActiveTag(tag)
            void account.searchLinks(account.search, tag || undefined)
          }}
          onRefresh={() => void account.searchLinks(account.search, account.activeTag || undefined)}
          onLoadMore={() => void account.loadMore()}
        />
        <ActivitySection activity={account.activity} />
      </main>
    </div>
  )
}
