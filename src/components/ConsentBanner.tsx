/* eslint-disable react-hooks/set-state-in-effect -- consent visibility can only be determined client-side after mount. */
'use client'
import { useEffect, useState } from 'react'
import { buildConsentCookie, shouldShowConsentBanner, type ConsentChoice } from '@/components/consent-logic'

export function ConsentBanner() {
  // Start hidden so server and first client render match (no hydration
  // mismatch); visibility is decided in an effect by reading document.cookie.
  // This component only writes the ql_consent choice marker on explicit click
  // and never sets tracking state beforehand. Note: redirect-time pixels in
  // src/app/[shortCode]/route.ts fire regardless of this choice (out of scope
  // here) — gate them on ql_consent=analytics before relying on this banner.
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      setShow(shouldShowConsentBanner(typeof document !== 'undefined' ? document.cookie : ''))
    } catch {
      setShow(false)
    }
  }, [])
  if (!show) return null
  function choose(v: ConsentChoice) {
    try {
      document.cookie = buildConsentCookie(v)
    } catch {
      // Cookies disabled — just dismiss so the banner never bricks the page.
    }
    setShow(false)
  }
  return (
    <aside
      role="dialog"
      aria-label="Privacy choices"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 p-5 text-white shadow-2xl"
    >
      <h2 className="font-semibold">Privacy choices</h2>
      <p className="mt-1 text-sm text-slate-300">
        QuickLink uses essential storage to keep the service secure. Analytics is optional.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => choose('essential')}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => choose('analytics')}
          className="rounded-lg bg-white px-4 py-2 text-sm text-slate-950"
        >
          Allow analytics
        </button>
      </div>
    </aside>
  )
}
