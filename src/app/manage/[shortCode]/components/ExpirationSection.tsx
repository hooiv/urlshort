'use client'

import { KeyRound } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'

interface ExpirationSectionProps {
  expiresAt: string
  expiredUrl: string
  maxClicks: string
  password: string
  hasPassword: boolean
  onExpiresAtChange: (value: string) => void
  onExpiredUrlChange: (value: string) => void
  onMaxClicksChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSaveExpiration: () => void
  onSavePassword: () => void
}

export default function ExpirationSection({
  expiresAt,
  expiredUrl,
  maxClicks,
  password,
  hasPassword,
  onExpiresAtChange,
  onExpiredUrlChange,
  onMaxClicksChange,
  onPasswordChange,
  onSaveExpiration,
  onSavePassword,
}: ExpirationSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="font-semibold text-white">Access Protection & Expiration Controls</h2>
      <p className="mt-1 text-xs text-slate-400">
        Enforce self-destruct click limits, time-based expirations, or gate with a password.
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {/* Expiration Controls */}
        <div className="space-y-4">
          <Field label="Expiration Date & Time">
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => onExpiresAtChange(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Max Click Limit (Self-Destruct)">
            <input
              type="number"
              min="1"
              value={maxClicks}
              onChange={(e) => onMaxClicksChange(e.target.value)}
              placeholder="e.g. 500"
              className="input"
            />
          </Field>
          <Field label="Expired Fallback Destination">
            <input
              type="url"
              value={expiredUrl}
              onChange={(e) => onExpiredUrlChange(e.target.value)}
              placeholder="https://example.com/expired"
              className="input"
            />
          </Field>
          <button
            onClick={onSaveExpiration}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            Save Expiration Limits
          </button>
        </div>

        {/* Password Protection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <KeyRound className="h-4 w-4 text-amber-400" />
            <span>Password Gate ({hasPassword ? 'Active' : 'Disabled'})</span>
          </div>
          <Field label="Set or Override Password">
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder={hasPassword ? '•••••••• (Leave blank to remove)' : 'Enter access password'}
              className="input"
            />
          </Field>
          <p className="text-[11px] text-slate-500">
            Visitors must enter this password on a branded security portal before being redirected.
          </p>
          <button
            onClick={onSavePassword}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            Update Password Gate
          </button>
        </div>
      </div>
    </section>
  )
}
