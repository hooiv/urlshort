'use client'

import { Zap } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'
import RuleCard from '@/app/manage/[shortCode]/components/RuleCard'
import type { Form, Rule } from '@/app/manage/[shortCode]/components/campaign-types'

interface RoutingRulesEditorProps {
  form: Form
  onFormChange: (form: Form) => void
  busy: boolean
  rules: Rule[]
  onSubmit: (event: React.FormEvent) => void
  onToggleRule: (rule: Rule) => void
  onDeleteRule: (rule: Rule) => void
}

export default function RoutingRulesEditor({
  form,
  onFormChange,
  busy,
  rules,
  onSubmit,
  onToggleRule,
  onDeleteRule,
}: RoutingRulesEditorProps) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      {/* Add Rule Form */}
      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          <h2 className="font-semibold text-white">Create Routing Rule / Experiment Variant</h2>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Blank filters match all traffic. Equal priority creates deterministic A/B test splits.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Rule / Variant Name">
            <input
              required
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              className="input"
              placeholder="e.g. iOS Mobile App Store or Variant B CTA"
            />
          </Field>

          <Field label="Destination URL">
            <input
              required
              type="url"
              value={form.destinationUrl}
              onChange={(e) => onFormChange({ ...form, destinationUrl: e.target.value })}
              className="input"
              placeholder="https://example.com/ios-landing"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority (lower runs first)">
              <input
                type="number"
                min="0"
                max="10000"
                value={form.priority}
                onChange={(e) => onFormChange({ ...form, priority: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Traffic Weight (for A/B split)">
              <input
                type="number"
                min="0"
                max="1000"
                value={form.weight}
                onChange={(e) => onFormChange({ ...form, weight: e.target.value })}
                className="input"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Traffic Class">
              <select
                value={form.trafficType}
                onChange={(e) => onFormChange({ ...form, trafficType: e.target.value })}
                className="input"
              >
                <option value="">Any traffic</option>
                <option value="human">Human visitors</option>
                <option value="ai_agent">AI agents</option>
                <option value="bot">Other bots</option>
              </select>
            </Field>
            <Field label="AI Agent">
              <select
                value={form.aiAgent}
                onChange={(e) => onFormChange({ ...form, aiAgent: e.target.value })}
                className="input"
              >
                <option value="">Any AI agent</option>
                <option value="openai">OpenAI</option>
                <option value="openai-search">OpenAI Search</option>
                <option value="chatgpt-user">ChatGPT user agent</option>
                <option value="anthropic">Anthropic</option>
                <option value="claude-user">Claude user agent</option>
                <option value="perplexity">Perplexity</option>
                <option value="google-ai">Google AI</option>
                <option value="google-gemini">Google Gemini</option>
                <option value="amazon">Amazon</option>
                <option value="bytedance">ByteDance</option>
                <option value="common-crawl">Common Crawl</option>
                <option value="cohere">Cohere</option>
                <option value="youcom">You.com</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Operating System">
              <select
                value={form.os}
                onChange={(e) => onFormChange({ ...form, os: e.target.value })}
                className="input"
              >
                <option value="">Any OS</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="chromeos">ChromeOS</option>
              </select>
            </Field>
            <Field label="Languages (ISO codes)">
              <input
                value={form.languageCodes}
                onChange={(e) => onFormChange({ ...form, languageCodes: e.target.value })}
                className="input"
                placeholder="en, ja, de"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Country Codes (ISO, comma-separated)">
              <input
                value={form.countryCodes}
                onChange={(e) => onFormChange({ ...form, countryCodes: e.target.value })}
                className="input"
                placeholder="US, GB, DE, CA"
              />
            </Field>
            <Field label="Device Type Filter">
              <select
                value={form.deviceType}
                onChange={(e) => onFormChange({ ...form, deviceType: e.target.value })}
                className="input"
              >
                <option value="">Any Device</option>
                <option value="mobile">Mobile Only</option>
                <option value="tablet">Tablet Only</option>
                <option value="desktop">Desktop Only</option>
              </select>
            </Field>
          </div>

          <Field label="Referrer Domain Filter">
            <input
              value={form.referrerDomain}
              onChange={(e) => onFormChange({ ...form, referrerDomain: e.target.value })}
              className="input"
              placeholder="e.g. instagram.com or tiktok.com"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Active From (optional schedule)">
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => onFormChange({ ...form, startAt: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Active Until (optional schedule)">
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => onFormChange({ ...form, endAt: e.target.value })}
                className="input"
              />
            </Field>
          </div>

          <button
            disabled={busy}
            className="w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
          >
            {busy ? 'Publishing…' : 'Publish Rule Variant'}
          </button>
        </div>
      </form>

      {/* Active Rules List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Active Routing Rules</h2>
            <p className="mt-1 text-xs text-slate-400">Rules evaluated in priority order.</p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-mono text-slate-300">
            {rules.length} Rule{rules.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {rules.length ? (
            rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={() => onToggleRule(rule)}
                onDelete={() => onDeleteRule(rule)}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
              No custom routing rules yet. Add one to start routing by device, country, or start an A/B experiment.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
