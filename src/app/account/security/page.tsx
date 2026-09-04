'use client'

import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import PasswordSection from '@/app/account/security/components/PasswordSection'
import SessionsSection from '@/app/account/security/components/SessionsSection'
import { useSessions } from '@/app/account/security/components/useSessions'

export default function SecurityPage() {
  const { sessions, loading, revoking, revoke } = useSessions()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />
      <header className="border-b border-slate-800">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Account
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-blue-300" />
            <h1 className="text-3xl font-semibold">Session security</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Review where your account is signed in and revoke anything you do not recognize.
          </p>
        </div>
        <SessionsSection
          sessions={sessions}
          loading={loading}
          revoking={revoking}
          onRevoke={(sessionId) => void revoke(sessionId)}
        />
        <PasswordSection />
      </main>
    </div>
  )
}
