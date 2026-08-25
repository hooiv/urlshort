'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface ScanResult {
  shortCode: string
  originalUrl?: string
  riskStatus?: 'cleared' | 'review' | 'blocked'
  riskReason?: string | null
  isActive?: boolean
}

export default function AbuseReportPage() {
  // Scan state
  const [scanInput, setScanInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // Report Form state
  const [shortCode, setShortCode] = useState('')
  const [reason, setReason] = useState('phishing')
  const [details, setDetails] = useState('')
  const [reporterEmail, setReporterEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    if (!scanInput.trim()) return toast.error('Enter a short code or link URL')
    setScanning(true)
    setScanResult(null)

    // Extract short code if user pasted a full URL
    let code = scanInput.trim()
    try {
      if (code.includes('/')) {
        const parts = code.split('/')
        code = parts[parts.length - 1] || parts[parts.length - 2] || code
      }
    } catch {
      // Use raw input
    }

    try {
      const res = await fetch(`/api/links/${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Link not found')
      }

      setScanResult({
        shortCode: data.shortCode,
        originalUrl: data.originalUrl,
        riskStatus: data.riskStatus || 'cleared',
        riskReason: data.riskReason || null,
        isActive: data.isActive,
      })
      setShortCode(data.shortCode)
      toast.success('Link scanned successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!shortCode.trim()) return toast.error('Enter the short code to report')
    setSubmitting(true)
    try {
      const res = await fetch('/api/abuse/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortCode: shortCode.trim(),
          reason,
          details: details.trim() || undefined,
          reporter: reporterEmail.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit report')

      setTicketId(data.id)
      toast.success('Abuse report submitted. Thank you for keeping QuickLink safe!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Report submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              title="Return to Home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              <span className="font-semibold text-white">Trust & Safety Portal</span>
            </div>
          </div>

          <Link
            href="/"
            className="text-xs font-semibold text-slate-400 hover:text-white"
          >
            QuickLink Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* Hero Section */}
        <section className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1 text-xs font-semibold text-red-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            24/7 Automated Link Safety & Anti-Abuse
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Report Abusive or Malicious Links
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-400">
            We enforce strict anti-phishing, anti-malware, and DMCA protection. Scan suspect links or file an instant report to flag malicious content for immediate suspension.
          </p>
        </section>

        {/* Real-Time Link Scanner */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-white font-semibold text-base">
            <Search className="h-4 w-4 text-blue-400" />
            <span>Instant Safety Lookup</span>
          </div>

          <form onSubmit={handleScan} className="flex gap-3">
            <input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Paste link URL or code (e.g. quicklink.to/abc1234)"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
            />
            <button
              disabled={scanning}
              className="rounded-xl bg-blue-500 px-5 py-3 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
            >
              {scanning ? 'Scanning…' : 'Verify Link Safety'}
            </button>
          </form>

          {/* Scan Results Card */}
          {scanResult && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-blue-400 font-semibold">/{scanResult.shortCode}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    scanResult.riskStatus === 'cleared'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {scanResult.riskStatus === 'cleared' ? 'Cleared / Safe' : 'Flagged for Review'}
                </span>
              </div>

              {scanResult.originalUrl && (
                <div className="text-xs text-slate-300 font-mono truncate">
                  Destination: {scanResult.originalUrl}
                </div>
              )}

              {scanResult.riskReason && (
                <div className="text-xs text-amber-300">
                  Assessment Notes: {scanResult.riskReason}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Report Form & Ticket Confirmation */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">File an Abuse Ticket</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Reports are reviewed automatically and escalated to our safety engineering team.
              </p>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>

          {ticketId ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
              <h3 className="font-bold text-white text-base">Abuse Report Received</h3>
              <p className="text-xs text-emerald-200/80 max-w-md mx-auto">
                Thank you for notifying us. Reference Ticket ID:{' '}
                <code className="font-mono text-emerald-300 font-bold">{ticketId}</code>. High-risk phishing links are suspended automatically within seconds.
              </p>
              <button
                onClick={() => {
                  setTicketId(null)
                  setDetails('')
                  setShortCode('')
                }}
                className="mt-2 inline-flex rounded-xl bg-slate-900 border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
              >
                Submit Another Report
              </button>
            </div>
          ) : (
            <form onSubmit={handleReportSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Short Link Code / Backhalf
                  </label>
                  <input
                    required
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value)}
                    placeholder="e.g. abc1234 or summer-sale"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Abuse Violation Category
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value="phishing">Phishing / Credential Theft</option>
                    <option value="malware">Malware / Executable Download</option>
                    <option value="spam">Spam / Unsolicited Broadcast</option>
                    <option value="copyright">DMCA / Copyright Violation</option>
                    <option value="other">Other Terms Violation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Your Contact Email <span className="font-normal text-slate-500 lowercase">(optional for updates)</span>
                </label>
                <input
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  placeholder="reporter@security-firm.com"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Evidence & Additional Details <span className="font-normal text-slate-500 lowercase">(optional)</span>
                </label>
                <textarea
                  rows={4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide context, target brand impersonated, or technical headers..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-100 outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <button
                disabled={submitting}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-red-500 py-3.5 font-semibold text-xs text-white hover:bg-red-600 disabled:opacity-60 transition shadow-lg shadow-red-500/20"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Submitting Report…' : 'Submit Abuse Report'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
