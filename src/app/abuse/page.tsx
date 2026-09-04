'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { SafetyLookup, SafetyLookupHeader } from './components/SafetyLookup'
import { ScanResultCard } from './components/ScanResultCard'
import { ReportForm } from './components/ReportForm'
import { TicketConfirmation } from './components/TicketConfirmation'
import { useAbuseScan } from './components/useAbuseScan'
import { useAbuseReport } from './components/useAbuseReport'

export default function AbuseReportPage() {
  const report = useAbuseReport()
  const scan = useAbuseScan(report.setShortCode)

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
          <SafetyLookupHeader />

          <SafetyLookup
            value={scan.scanInput}
            onChange={scan.setScanInput}
            scanning={scan.scanning}
            onSubmit={scan.handleScan}
          />

          {scan.scanError && (
            <p role="alert" className="text-xs text-red-300">
              {scan.scanError}
            </p>
          )}

          {/* Scan Results Card */}
          {scan.scanResult && <ScanResultCard result={scan.scanResult} />}
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

          {report.ticketId ? (
            <TicketConfirmation ticketId={report.ticketId} onReset={report.resetTicket} />
          ) : (
            <ReportForm
              shortCode={report.shortCode}
              onShortCodeChange={report.setShortCode}
              reason={report.reason}
              onReasonChange={report.setReason}
              details={report.details}
              onDetailsChange={report.setDetails}
              reporterEmail={report.reporterEmail}
              onReporterEmailChange={report.setReporterEmail}
              submitting={report.submitting}
              onSubmit={report.handleReportSubmit}
            />
          )}
        </section>
      </main>
    </div>
  )
}
