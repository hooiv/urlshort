'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  Code2,
  Copy,
  KeyRound,
  Play,
  Send,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface EndpointSpec {
  id: string
  group: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  title: string
  description: string
  pathParams?: Array<{ name: string; placeholder: string; default: string }>
  queryParams?: Array<{ name: string; placeholder: string; default?: string }>
  defaultBody?: Record<string, unknown>
}

const API_CATALOG: EndpointSpec[] = [
  // Links
  {
    id: 'shorten-create',
    group: 'Core Links',
    method: 'POST',
    path: '/api/shorten',
    title: 'Create Smart Short Link',
    description: 'Generates a new shortened link with optional custom alias, title, description, and tags.',
    defaultBody: {
      url: 'https://example.com/product-launch',
      customCode: 'launch-2026',
      title: 'Summer Product Launch',
      tags: ['marketing', 'launch'],
    },
  },
  {
    id: 'shorten-list',
    group: 'Core Links',
    method: 'GET',
    path: '/api/shorten',
    title: 'List Accessible Links',
    description: 'Retrieves keyset-paginated links with search and tag filtering support.',
    queryParams: [
      { name: 'search', placeholder: 'e.g. launch', default: '' },
      { name: 'tag', placeholder: 'e.g. marketing', default: '' },
      { name: 'take', placeholder: '20', default: '20' },
    ],
  },
  {
    id: 'link-detail',
    group: 'Core Links',
    method: 'GET',
    path: '/api/links/{shortCode}',
    title: 'Get Link Metadata',
    description: 'Fetches detailed configuration, click metrics, health status, and safety assessment.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
  },
  {
    id: 'link-update',
    group: 'Core Links',
    method: 'PATCH',
    path: '/api/links/{shortCode}',
    title: 'Update Link Settings',
    description: 'Modifies destination URL, password protection, retargeting pixels, or link expiration.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      title: 'Updated Campaign Title',
      tags: ['marketing', 'v2'],
    },
  },
  {
    id: 'link-delete',
    group: 'Core Links',
    method: 'DELETE',
    path: '/api/links/{shortCode}',
    title: 'Delete Short Link',
    description: 'Deactivates a short link permanently while preserving historic audit trail.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
  },

  // Routing & Experiments
  {
    id: 'rules-create',
    group: 'Smart Routing & A/B Tests',
    method: 'POST',
    path: '/api/links/{shortCode}/rules',
    title: 'Create Routing Rule / Variant',
    description: 'Creates a geo, device, referrer, or weighted split-test destination variant.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      name: 'iOS Mobile App Store',
      destinationUrl: 'https://apps.apple.com/app/id123456789',
      priority: 100,
      weight: 100,
      deviceType: 'mobile',
      countryCodes: 'US,GB,CA',
    },
  },
  {
    id: 'promote-variant',
    group: 'Smart Routing & A/B Tests',
    method: 'POST',
    path: '/api/links/{shortCode}/promote',
    title: 'Promote Winning Variant',
    description: 'Promotes an experimental routing variant into the permanent primary fallback destination.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      ruleId: 'cuid_rule_sample_id',
    },
  },
  {
    id: 'revisions-create',
    group: 'Smart Routing & A/B Tests',
    method: 'POST',
    path: '/api/links/{shortCode}/revisions',
    title: 'Publish Destination Release',
    description: 'Appends a versioned release revision for seamless zero-downtime destination updates.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      destinationUrl: 'https://example.com/v2-campaign',
      reason: 'Q3 Promotional Update',
    },
  },

  // Analytics & QR
  {
    id: 'analytics-get',
    group: 'Analytics & Attribution',
    method: 'GET',
    path: '/api/analytics/{shortCode}',
    title: 'Get Multi-Dimensional Analytics',
    description: 'Retrieves time-series clicks, conversions, geo breakdowns, OS/browser splits, and Bayesian A/B test results.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    queryParams: [
      { name: 'range', placeholder: '7d', default: '7d' },
      { name: 'country', placeholder: 'US', default: '' },
      { name: 'device', placeholder: 'mobile', default: '' },
    ],
  },
  {
    id: 'qr-generate',
    group: 'Analytics & Attribution',
    method: 'GET',
    path: '/api/links/{shortCode}/qr',
    title: 'Generate Custom Vector QR Code',
    description: 'Renders high-res 4K PNG or SVG QR codes with custom color schemes and center logo badges.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    queryParams: [
      { name: 'format', placeholder: 'png | svg', default: 'svg' },
      { name: 'size', placeholder: '512', default: '512' },
      { name: 'dark', placeholder: '#0f172a', default: '#0f172a' },
      { name: 'light', placeholder: '#ffffff', default: '#ffffff' },
      { name: 'icon', placeholder: 'link | twitter | github', default: 'link' },
    ],
  },
  {
    id: 'webhook-test',
    group: 'Diagnostics & Webhooks',
    method: 'POST',
    path: '/api/links/{shortCode}/webhook-test',
    title: 'Dispatch Test Webhook',
    description: 'Sends a signed HMAC-SHA256 test click event payload to verify customer webhook endpoints.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      webhookUrl: 'https://webhook.site/sample-uuid',
    },
  },
  {
    id: 'health-probe',
    group: 'Diagnostics & Webhooks',
    method: 'POST',
    path: '/api/links/{shortCode}/health',
    title: 'Trigger Health Probe',
    description: 'Executes on-demand HTTP health check probe against fallback destination and rule variants.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      target: 'fallback',
    },
  },
]

const METHOD_COLORS = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
}

type LangTab = 'curl' | 'node' | 'python' | 'go'

export default function ApiDocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointSpec>(API_CATALOG[0])
  const [apiKey, setApiKey] = useState('')
  const [langTab, setLangTab] = useState<LangTab>('curl')

  // Form states for the playground
  const [pathParamValues, setPathParamValues] = useState<Record<string, string>>({ shortCode: 'demo' })
  const [queryParamValues, setQueryParamValues] = useState<Record<string, string>>({})
  const [requestBodyText, setRequestBodyText] = useState(
    JSON.stringify(API_CATALOG[0].defaultBody || {}, null, 2)
  )

  // Response execution states
  const [executing, setExecuting] = useState(false)
  const [responseResult, setResponseResult] = useState<{
    status: number
    statusText: string
    latencyMs: number
    data: unknown
    headers: Record<string, string>
  } | null>(null)

  function selectEndpoint(spec: EndpointSpec) {
    setSelectedEndpoint(spec)
    const initialPaths: Record<string, string> = {}
    spec.pathParams?.forEach((p) => {
      initialPaths[p.name] = p.default || 'demo'
    })
    setPathParamValues(initialPaths)

    const initialQueries: Record<string, string> = {}
    spec.queryParams?.forEach((q) => {
      if (q.default) initialQueries[q.name] = q.default
    })
    setQueryParamValues(initialQueries)

    setRequestBodyText(spec.defaultBody ? JSON.stringify(spec.defaultBody, null, 2) : '')
    setResponseResult(null)
  }

  // Generate resolved endpoint path
  const resolvedPath = useMemo(() => {
    let p = selectedEndpoint.path
    if (selectedEndpoint.pathParams) {
      selectedEndpoint.pathParams.forEach((param) => {
        const val = pathParamValues[param.name] || param.default || `{${param.name}}`
        p = p.replace(`{${param.name}}`, encodeURIComponent(val))
      })
    }

    const q = new URLSearchParams()
    Object.entries(queryParamValues).forEach(([k, v]) => {
      if (v && v.trim()) q.set(k, v.trim())
    })
    const qs = q.toString()
    return qs ? `${p}?${qs}` : p
  }, [selectedEndpoint, pathParamValues, queryParamValues])

  // Generate multi-language code snippets
  const codeSnippet = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quicklink.to'
    const fullUrl = `${origin}${resolvedPath}`
    const key = apiKey.trim() || 'qlk_live_your_api_key'

    if (langTab === 'curl') {
      let cmd = `curl -X ${selectedEndpoint.method} "${fullUrl}" \\\n  -H "x-api-key: ${key}"`
      if (['POST', 'PATCH'].includes(selectedEndpoint.method) && requestBodyText.trim()) {
        cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBodyText.replace(/\n\s*/g, ' ')}'`
      }
      return cmd
    }

    if (langTab === 'node') {
      const opts: { method: string; headers: Record<string, string>; body?: string } = {
        method: selectedEndpoint.method,
        headers: {
          'x-api-key': key,
          ...(['POST', 'PATCH'].includes(selectedEndpoint.method) ? { 'Content-Type': 'application/json' } : {}),
        },
      }
      if (['POST', 'PATCH'].includes(selectedEndpoint.method) && requestBodyText.trim()) {
        opts.body = 'PAYLOAD'
      }

      const optsStr = JSON.stringify(opts, null, 2).replace('"PAYLOAD"', requestBodyText || '{}')
      return `const response = await fetch("${fullUrl}", ${optsStr});\n\nconst data = await response.json();\nconsole.log(data);`
    }

    if (langTab === 'python') {
      let py = `import requests\n\nurl = "${fullUrl}"\nheaders = {\n    "x-api-key": "${key}"\n}`
      if (['POST', 'PATCH'].includes(selectedEndpoint.method) && requestBodyText.trim()) {
        py += `\npayload = ${requestBodyText}\n\nresponse = requests.${selectedEndpoint.method.toLowerCase()}(url, json=payload, headers=headers)`
      } else {
        py += `\n\nresponse = requests.${selectedEndpoint.method.toLowerCase()}(url, headers=headers)`
      }
      py += '\nprint(response.status_code, response.json())'
      return py
    }

    if (langTab === 'go') {
      return `package main\n\nimport (\n\t"fmt"\n\t"net/http"\n\t"io"\n)\n\nfunc main() {\n\treq, _ := http.NewRequest("${selectedEndpoint.method}", "${fullUrl}", nil)\n\treq.Header.Set("x-api-key", "${key}")\n\tclient := &http.Client{}\n\tresp, err := client.Do(req)\n\tif err != nil { panic(err) }\n\tdefer resp.Body.Close()\n\tbody, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(body))\n}`
    }

    return ''
  }, [langTab, selectedEndpoint, resolvedPath, apiKey, requestBodyText])

  async function executeRequest() {
    setExecuting(true)
    setResponseResult(null)
    const startTime = performance.now()
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (apiKey.trim()) {
        headers['x-api-key'] = apiKey.trim()
      }

      const init: RequestInit = {
        method: selectedEndpoint.method,
        headers,
      }

      if (['POST', 'PATCH'].includes(selectedEndpoint.method) && requestBodyText.trim()) {
        init.body = requestBodyText
      }

      const res = await fetch(resolvedPath, init)
      const latencyMs = Math.round(performance.now() - startTime)

      const headerMap: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        headerMap[k] = v
      })

      const data = await res.json().catch(() => null)

      setResponseResult({
        status: res.status,
        statusText: res.statusText,
        latencyMs,
        data,
        headers: headerMap,
      })

      if (res.ok) {
        toast.success(`HTTP ${res.status} ${res.statusText} (${latencyMs}ms)`)
      } else {
        toast.error(`HTTP ${res.status}: ${data?.error || res.statusText}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Network request failed')
    } finally {
      setExecuting(false)
    }
  }

  function copyCode(text: string) {
    void navigator.clipboard.writeText(text)
    toast.success('Code copied to clipboard')
  }

  const groups = useMemo(() => {
    const map = new Map<string, EndpointSpec[]>()
    API_CATALOG.forEach((item) => {
      const list = map.get(item.group) || []
      list.push(item)
      map.set(item.group, list)
    })
    return Array.from(map.entries())
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              title="Return to Account"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-white">Developer API Reference & Live Playground</span>
              </div>
              <p className="text-xs text-slate-500">Programmatic REST API for enterprise link operations</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5 text-amber-400" />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste API Key (qlk_...)"
                className="bg-transparent text-slate-200 outline-none w-44 placeholder:text-slate-600 font-mono text-[11px]"
              />
            </div>
            <Link
              href="/account"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              Manage API Keys
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Sidebar Navigation */}
          <aside className="space-y-6">
            {groups.map(([groupName, endpoints]) => (
              <div key={groupName} className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-2">
                  {groupName}
                </div>
                {endpoints.map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => selectEndpoint(ep)}
                    className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                      selectedEndpoint.id === ep.id
                        ? 'bg-blue-500/10 text-white font-semibold border border-blue-500/30'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{ep.title}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold border ${
                        METHOD_COLORS[ep.method]
                      }`}
                    >
                      {ep.method}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          {/* Main API Playground */}
          <div className="space-y-6">
            {/* Active Endpoint Header */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
                    METHOD_COLORS[selectedEndpoint.method]
                  }`}
                >
                  {selectedEndpoint.method}
                </span>
                <code className="font-mono text-sm font-semibold text-white">{selectedEndpoint.path}</code>
              </div>
              <h1 className="mt-3 text-xl font-bold text-white">{selectedEndpoint.title}</h1>
              <p className="mt-1 text-sm text-slate-400">{selectedEndpoint.description}</p>
            </section>

            {/* Interactive Request Builder */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Play className="h-4 w-4 text-emerald-400" />
                  <span>Live Interactive Console</span>
                </div>
                <span className="font-mono text-xs text-blue-400 truncate max-w-md">{resolvedPath}</span>
              </div>

              {/* Path Parameters */}
              {selectedEndpoint.pathParams && selectedEndpoint.pathParams.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Path Parameters</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedEndpoint.pathParams.map((p) => (
                      <div key={p.name}>
                        <label className="block text-xs text-slate-400 mb-1">{p.name}</label>
                        <input
                          value={pathParamValues[p.name] || ''}
                          onChange={(e) =>
                            setPathParamValues({ ...pathParamValues, [p.name]: e.target.value })
                          }
                          placeholder={p.placeholder}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Query Parameters */}
              {selectedEndpoint.queryParams && selectedEndpoint.queryParams.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Query Parameters</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {selectedEndpoint.queryParams.map((q) => (
                      <div key={q.name}>
                        <label className="block text-xs text-slate-400 mb-1">{q.name}</label>
                        <input
                          value={queryParamValues[q.name] || ''}
                          onChange={(e) =>
                            setQueryParamValues({ ...queryParamValues, [q.name]: e.target.value })
                          }
                          placeholder={q.placeholder}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* JSON Body Editor */}
              {['POST', 'PATCH'].includes(selectedEndpoint.method) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider">JSON Request Payload</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRequestBodyText(
                          JSON.stringify(selectedEndpoint.defaultBody || {}, null, 2)
                        )
                      }
                      className="text-blue-400 hover:underline text-[11px]"
                    >
                      Reset to Default
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={requestBodyText}
                    onChange={(e) => setRequestBodyText(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <button
                disabled={executing}
                onClick={() => void executeRequest()}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-500 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 disabled:opacity-60 transition"
              >
                <Send className="h-3.5 w-3.5" />
                {executing ? 'Executing Request…' : `Send ${selectedEndpoint.method} Request`}
              </button>
            </section>

            {/* Live Response Box */}
            {responseResult && (
              <section className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        responseResult.status < 400
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      HTTP {responseResult.status} {responseResult.statusText}
                    </span>
                    <span className="text-xs text-slate-500">{responseResult.latencyMs}ms latency</span>
                  </div>

                  <button
                    onClick={() => copyCode(JSON.stringify(responseResult.data, null, 2))}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy JSON
                  </button>
                </div>

                <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-200">
                  {JSON.stringify(responseResult.data, null, 2)}
                </pre>
              </section>
            )}

            {/* Multi-Language Code Snippets */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Code2 className="h-4 w-4 text-blue-400" />
                  <span>SDK Code Generation</span>
                </div>

                <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                  {(['curl', 'node', 'python', 'go'] as LangTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setLangTab(tab)}
                      className={`rounded px-2.5 py-1 uppercase text-[10px] font-bold transition ${
                        langTab === tab ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-300">
                  <code>{codeSnippet}</code>
                </pre>
                <button
                  onClick={() => copyCode(codeSnippet)}
                  className="absolute right-3 top-3 rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white"
                  title="Copy code"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
