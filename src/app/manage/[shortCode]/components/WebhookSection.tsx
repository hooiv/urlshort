'use client'

import { Radio, Send } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'
import type { WebhookTestResponse } from '@/app/manage/[shortCode]/components/campaign-types'

interface WebhookSectionProps {
  webhookUrl: string
  onWebhookUrlChange: (value: string) => void
  onSave: () => void
  onTest: () => void
  testing: boolean
  result: WebhookTestResponse | null
}

export default function WebhookSection({ webhookUrl, onWebhookUrlChange, onSave, onTest, testing, result }: WebhookSectionProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-emerald-400" />
        <h2 className="font-semibold text-white">Event Webhooks</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Receive signed HMAC-SHA256 HTTP POST payloads in real-time when visitors click this link.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Webhook Endpoint URL">
          <input
            value={webhookUrl}
            onChange={(e) => onWebhookUrlChange(e.target.value)}
            type="url"
            placeholder="https://api.yourdomain.com/webhooks/clicks"
            className="input"
          />
        </Field>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={onSave}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            Save Webhook URL
          </button>
          <button
            onClick={onTest}
            disabled={testing || !webhookUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {testing ? 'Dispatching Ping…' : 'Send Test Webhook'}
          </button>
        </div>

        {result && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                Status: HTTP {result.statusCode || 'N/A'}
              </span>
              <span className="text-slate-500">{result.latencyMs}ms latency</span>
            </div>
            {result.responseBodySnippet && (
              <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-400">
                {result.responseBodySnippet}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
