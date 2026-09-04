'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import ResetPasswordCard from '@/app/reset-password/components/ResetPasswordCard'
import { useResetPassword } from '@/app/reset-password/components/useResetPassword'

function ResetPasswordForm() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const { password, setPassword, confirm, setConfirm, busy, done, submit } = useResetPassword(token)

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">
        <Link href="/account" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to QuickLink
        </Link>
        <ResetPasswordCard
          password={password}
          confirm={confirm}
          busy={busy}
          done={done}
          token={token}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          onSubmit={(event) => void submit(event)}
        />
      </div>
      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(15 23 42);
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          color: rgb(241 245 249);
          outline: none;
        }
        .input:focus {
          border-color: rgb(96 165 250);
          box-shadow: 0 0 0 3px rgb(59 130 246 / 0.15);
        }
      `}</style>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
