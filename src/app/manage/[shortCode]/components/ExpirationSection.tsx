'use client'

import { KeyRound } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'

interface ExpirationSectionProps {
  expiresAt: string
  expiredUrl: string
  startsAt: string
  notStartedUrl: string
  onStartsAtChange: (value: string) => void
  clickIdParam: string
  queryForwardMode: string
  queryForwardAllow: string
  onQueryForwardModeChange: (value: string) => void
  onQueryForwardAllowChange: (value: string) => void
  onClickIdParamChange: (value: string) => void
  redirectStatus: string
  onRedirectStatusChange: (value: string) => void
  onNotStartedUrlChange: (value: string) => void
  maxClicks: string
  dailyClickCap: string
  onDailyClickCapChange: (value: string) => void
  lifetimeMinutes: string
  onLifetimeMinutesChange: (value: string) => void
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
  startsAt,
  notStartedUrl,
  onStartsAtChange,
  clickIdParam,
  queryForwardMode,
  queryForwardAllow,
  onQueryForwardModeChange,
  onQueryForwardAllowChange,
  onClickIdParamChange,
  redirectStatus,
  onRedirectStatusChange,
  onNotStartedUrlChange,
  maxClicks,
  dailyClickCap,
  onDailyClickCapChange,
  lifetimeMinutes,
  onLifetimeMinutesChange,
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
          <Field label="Go-live Date & Time (optional)">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => onStartsAtChange(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Pre-launch Destination (before go-live)">
            <input
              type="url"
              value={notStartedUrl}
              onChange={(e) => onNotStartedUrlChange(e.target.value)}
              placeholder="https://example.com/teaser"
              className="input"
            />
          </Field>
          <Field label="Click ID parameter (appended to destination, e.g. clickid)">
            <input
              type="text"
              value={clickIdParam}
              onChange={(e) => onClickIdParamChange(e.target.value)}
              placeholder="clickid"
              maxLength={32}
              className="input"
            />
          </Field>
          <Field label="Query parameters passed to destination (ql_* and credential params are never forwarded)">
            <select value={queryForwardMode} onChange={(e) => onQueryForwardModeChange(e.target.value)} className="input">
              <option value="all">Forward all (default)</option>
              <option value="none">Forward none</option>
              <option value="allowlist">Only listed names</option>
            </select>
            {queryForwardMode === 'allowlist' && (
              <input
                type="text"
                value={queryForwardAllow}
                onChange={(e) => onQueryForwardAllowChange(e.target.value)}
                placeholder="utm_source, utm_medium, ref"
                className="input mt-2"
              />
            )}
          </Field>
          <Field label="Redirect type (301/308 are cached by browsers; not allowed with password, schedule or click limit)">
            <select value={redirectStatus} onChange={(e) => onRedirectStatusChange(e.target.value)} className="input">
              <option value="">307 Temporary (default)</option>
              <option value="302">302 Found</option>
              <option value="301">301 Permanent</option>
              <option value="308">308 Permanent (keeps method)</option>
            </select>
          </Field>
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
          <Field label="Daily Click Cap (resets 00:00 UTC)">
            <input
              type="number"
              min="1"
              value={dailyClickCap}
              onChange={(e) => onDailyClickCapChange(e.target.value)}
              placeholder="e.g. 1000"
              className="input"
            />
          </Field>
          <Field label="Expires N minutes after first click">
            <input
              type="number"
              min="1"
              value={lifetimeMinutes}
              onChange={(e) => onLifetimeMinutesChange(e.target.value)}
              placeholder="e.g. 60"
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
