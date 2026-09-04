import { getRiskLabel, getRiskTone, type ScanResult } from './abuse-logic'

const TONE_STYLES: Record<string, string> = {
  safe: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  review: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  blocked: 'bg-red-500/10 text-red-400 border border-red-500/30',
}

/** Presentational scan-result card (no interactivity). */
export function ScanResultCard({ result }: { result: ScanResult }) {
  const tone = getRiskTone(result.riskStatus)
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 animate-in fade-in duration-200">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-blue-400 font-semibold">/{result.shortCode}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${TONE_STYLES[tone]}`}
        >
          {getRiskLabel(result.riskStatus)}
        </span>
      </div>

      {result.originalUrl && (
        <div className="text-xs text-slate-300 font-mono truncate" title={result.originalUrl}>
          Destination: {result.originalUrl}
        </div>
      )}

      {result.riskReason && (
        <div className="text-xs text-amber-300">Assessment Notes: {result.riskReason}</div>
      )}

      {result.isActive === false && (
        <div className="text-xs text-slate-500">This link is currently deactivated.</div>
      )}
    </div>
  )
}
