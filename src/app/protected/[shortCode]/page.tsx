'use client'

import { useParams } from 'next/navigation'
import ProtectedForm from '@/app/protected/[shortCode]/components/ProtectedForm'
import { parseShortCode } from '@/app/protected/[shortCode]/components/protected-logic'
import { useVerifyPassword } from '@/app/protected/[shortCode]/components/useVerifyPassword'

export default function ProtectedPage() {
  const { shortCode: raw } = useParams<{ shortCode: string }>()
  const shortCode = parseShortCode(raw)
  const { password, setPassword, error, loading, submit } = useVerifyPassword(shortCode)

  if (!shortCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <h1 className="text-xl font-bold text-white">Link not found</h1>
          <p className="mt-2 text-xs text-slate-400">This protected link is missing its short code.</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedForm
      shortCode={shortCode}
      password={password}
      error={error}
      loading={loading}
      onPasswordChange={setPassword}
      onSubmit={(event) => void submit(event)}
    />
  )
}
