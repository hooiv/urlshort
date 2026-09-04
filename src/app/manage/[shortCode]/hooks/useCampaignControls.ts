/* eslint-disable react-hooks/set-state-in-effect -- token hydrates from sessionStorage after mount. */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  buildPreviewPayload,
  buildRulePayload,
  buildUtmUrl,
  findLiveRevision,
  isHttpUrl,
  parseExpirationInput,
  parseMaxClicks,
  toDatetimeLocalValue,
} from '@/app/manage/[shortCode]/components/campaign-utils'
import {
  emptyForm,
  emptyPreview,
  type Form,
  type PreviewInput,
  type PreviewResult,
  type Revision,
  type Rule,
  type SocialPlatform,
  type WebhookTestResponse,
} from '@/app/manage/[shortCode]/components/campaign-types'

export type { Form, PreviewInput, PreviewResult, Revision, Rule, SocialPlatform, WebhookTestResponse }

/**
 * Owns every remote/data concern of the campaign control studio:
 * session token, link payload, rules, revisions, and all mutating actions.
 * Rendering lives in the colocated components; API shapes are unchanged.
 */
export function useCampaignControls(shortCode: string) {
  const [token, setToken] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Remote data state
  const [rules, setRules] = useState<Rule[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])

  // Form states
  const [form, setForm] = useState<Form>(emptyForm)
  const [releaseUrl, setReleaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingRuleIds, setPendingRuleIds] = useState<Set<string>>(new Set())
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // Metadata form state
  const [ogTitle, setOgTitle] = useState('')
  const [ogDesc, setOgDesc] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [socialTab, setSocialTab] = useState<SocialPlatform>('twitter')

  // Expiration and protection states
  const [expiresAt, setExpiresAt] = useState('')
  const [expiredUrl, setExpiredUrl] = useState('')
  const [maxClicks, setMaxClicks] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)

  // Pixels & Cloaking
  const [metaPixelId, setMetaPixelId] = useState('')
  const [googleTagId, setGoogleTagId] = useState('')
  const [xPixelId, setXPixelId] = useState('')
  const [cloaked, setCloaked] = useState(false)

  // Webhooks
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookTestBusy, setWebhookTestBusy] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResponse | null>(null)
  const [preview, setPreview] = useState<PreviewInput>(emptyPreview)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  // UTM builder
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')

  const endpoint = useMemo(() => `/api/links/${encodeURIComponent(shortCode)}`, [shortCode])

  useEffect(() => {
    setToken(sessionStorage.getItem(`ql-token:${shortCode}`))
  }, [shortCode])

  const load = useCallback(async () => {
    const headers = { 'x-management-token': token || '' }
    try {
      const [l, r, v] = await Promise.all([
        fetch(endpoint, { headers }),
        fetch(`${endpoint}/rules`, { headers }),
        fetch(`${endpoint}/revisions`, { headers }),
      ])
      const [linkPayload, rulesData, revisionsData] = await Promise.all([
        l.json(),
        r.json(),
        v.json(),
      ])

      if (!l.ok || !r.ok || !v.ok) {
        toast.error('Could not load campaign controls')
        return
      }

      setRules(rulesData)
      setRevisions(revisionsData)
      setTags(linkPayload.tags || [])

      setOgTitle(linkPayload.title || '')
      setOgDesc(linkPayload.description || '')
      setOgImage(linkPayload.ogImage || '')

      setExpiresAt(toDatetimeLocalValue(linkPayload.expiresAt ?? null))
      setExpiredUrl(linkPayload.expiredUrl || '')
      setMaxClicks(linkPayload.maxClicks ? String(linkPayload.maxClicks) : '')
      setHasPassword(Boolean(linkPayload.passwordHash))

      setMetaPixelId(linkPayload.metaPixelId || '')
      setGoogleTagId(linkPayload.googleTagId || '')
      setXPixelId(linkPayload.xPixelId || '')
      setCloaked(Boolean(linkPayload.cloaked))
      setWebhookUrl(linkPayload.webhookUrl || '')

      const live = findLiveRevision(revisionsData as Revision[], Date.now())
      if (live) setReleaseUrl(live.destinationUrl)
      setNowMs(Date.now())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error loading campaign controls')
    }
  }, [endpoint, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  // Bound to [endpoint, token] so rotate/re-login can never send a stale token.
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${endpoint}/${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        'Content-Type': 'application/json',
        'x-management-token': token || '',
      },
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'Request failed')
    return data
  }, [endpoint, token])

  const markRulePending = useCallback((id: string, pending: boolean) => {
    setPendingRuleIds((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  async function addRule(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    let payload: ReturnType<typeof buildRulePayload>
    try {
      payload = buildRulePayload(form)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid rule')
      return
    }
    setBusy(true)
    try {
      const data = await request('rules', { method: 'POST', body: JSON.stringify(payload) })
      setRules((items) => [...items, data].sort((a, b) => a.priority - b.priority))
      setForm(emptyForm)
      toast.success('Routing rule published')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add rule')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(rule: Rule) {
    if (pendingRuleIds.has(rule.id)) return
    markRulePending(rule.id, true)
    try {
      const data = await request(`rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      setRules((items) => items.map((item) => (item.id === rule.id ? data : item)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update rule')
    } finally {
      markRulePending(rule.id, false)
    }
  }

  async function deleteRule(rule: Rule) {
    if (pendingRuleIds.has(rule.id)) return
    if (!window.confirm(`Delete “${rule.name}”?`)) return
    markRulePending(rule.id, true)
    try {
      await request(`rules/${rule.id}`, { method: 'DELETE' })
      setRules((items) => items.filter((item) => item.id !== rule.id))
      toast.success('Rule deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete rule')
    } finally {
      markRulePending(rule.id, false)
    }
  }

  async function updateTags(newTags: string[]) {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ tags: newTags }) })
      setTags(newTags)
      toast.success('Tags updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update tags')
    }
  }

  async function publishRelease() {
    const destination = releaseUrl.trim()
    if (!destination) return toast.error('Enter a destination')
    if (!isHttpUrl(destination)) return toast.error('Enter a valid URL')
    try {
      const data = await request('revisions', {
        method: 'POST',
        body: JSON.stringify({ destinationUrl: destination, reason: 'Manual destination release' }),
      })
      setRevisions((items) => [data, ...items])
      toast.success('Destination published')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not publish destination')
    }
  }

  async function rollback(revision: Revision) {
    try {
      const data = await request('revisions', {
        method: 'POST',
        body: JSON.stringify({
          destinationUrl: revision.destinationUrl,
          reason: `Rollback to ${new Date(revision.effectiveAt).toLocaleString()}`,
        }),
      })
      setRevisions((items) => [data, ...items])
      setReleaseUrl(revision.destinationUrl)
      toast.success('Rollback published')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rollback')
    }
  }

  async function saveMetadata() {
    if (ogImage.trim() && !isHttpUrl(ogImage)) return toast.error('Enter a valid URL')
    try {
      await request('', {
        method: 'PATCH',
        body: JSON.stringify({ title: ogTitle || null, description: ogDesc || null, ogImage: ogImage || null }),
      })
      toast.success('Social metadata updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveExpiration() {
    let parsedExpiresAt: string | null
    let parsedMaxClicks: number | null
    try {
      parsedExpiresAt = parseExpirationInput(expiresAt)
      parsedMaxClicks = parseMaxClicks(maxClicks)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid expiration settings')
      return
    }
    if (expiredUrl.trim() && !isHttpUrl(expiredUrl)) return toast.error('Enter a valid URL')
    try {
      await request('', {
        method: 'PATCH',
        body: JSON.stringify({
          expiresAt: parsedExpiresAt,
          expiredUrl: expiredUrl || null,
          maxClicks: parsedMaxClicks,
        }),
      })
      toast.success('Expiration settings saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function savePassword() {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ password: password || null }) })
      toast.success(password ? 'Password protection enabled' : 'Password removed')
      setHasPassword(Boolean(password))
      setPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function savePixels() {
    try {
      await request('', {
        method: 'PATCH',
        body: JSON.stringify({
          metaPixelId: metaPixelId || null,
          googleTagId: googleTagId || null,
          xPixelId: xPixelId || null,
        }),
      })
      toast.success('Tracking pixels updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function toggleCloaking(enabled: boolean) {
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ cloaked: enabled }) })
      setCloaked(enabled)
      toast.success(enabled ? 'Link cloaking enabled' : 'Link cloaking disabled')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveWebhook() {
    if (webhookUrl.trim() && !isHttpUrl(webhookUrl)) return toast.error('Enter a valid URL')
    try {
      await request('', { method: 'PATCH', body: JSON.stringify({ webhookUrl: webhookUrl || null }) })
      toast.success(webhookUrl ? 'Webhook endpoint configured' : 'Webhook removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function testWebhook() {
    if (!webhookUrl.trim()) return toast.error('Enter a webhook URL to test')
    if (!isHttpUrl(webhookUrl)) return toast.error('Enter a valid URL')
    setWebhookTestBusy(true)
    setWebhookTestResult(null)
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}/webhook-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-management-token': token || '',
        },
        body: JSON.stringify({ webhookUrl }),
      })
      const result = await res.json()
      setWebhookTestResult(result)
      if (res.ok && result.success) {
        toast.success(`Webhook delivered successfully (${result.latencyMs}ms, HTTP ${result.statusCode})`)
      } else {
        toast.error(`Webhook returned status ${result.statusCode || 'error'}: ${result.error || 'Failed'}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Webhook dispatch test failed')
    } finally {
      setWebhookTestBusy(false)
    }
  }

  async function previewRouting() {
    let payload: ReturnType<typeof buildPreviewPayload>
    try {
      payload = buildPreviewPayload(preview)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid preview input')
      return
    }
    setPreviewBusy(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(shortCode)}/routing/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token || '' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Preview failed')
      setPreviewResult(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Routing preview failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  async function deleteLink() {
    await request('', { method: 'DELETE' })
  }

  function applyUtmPreset(source: string, medium: string, campaign: string) {
    setUtmSource(source)
    setUtmMedium(medium)
    setUtmCampaign(campaign)
    toast.success(`Applied ${source} preset`)
  }

  const generatedUtmUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return buildUtmUrl(origin, shortCode, { source: utmSource, medium: utmMedium, campaign: utmCampaign })
  }, [shortCode, utmSource, utmMedium, utmCampaign])

  const liveRevision = useMemo(
    () => (revisions.length ? findLiveRevision(revisions, nowMs) : undefined),
    [revisions, nowMs],
  )

  return {
    token,
    rules,
    revisions,
    liveRevision,
    form, setForm,
    releaseUrl, setReleaseUrl,
    busy,
    pendingRuleIds,
    tags, setTags,
    tagInput, setTagInput,
    ogTitle, setOgTitle,
    ogDesc, setOgDesc,
    ogImage, setOgImage,
    socialTab, setSocialTab,
    expiresAt, setExpiresAt,
    expiredUrl, setExpiredUrl,
    maxClicks, setMaxClicks,
    password, setPassword,
    hasPassword,
    metaPixelId, setMetaPixelId,
    googleTagId, setGoogleTagId,
    xPixelId, setXPixelId,
    cloaked,
    webhookUrl, setWebhookUrl,
    webhookTestBusy,
    webhookTestResult,
    preview, setPreview,
    previewResult,
    previewBusy,
    utmSource, setUtmSource,
    utmMedium, setUtmMedium,
    utmCampaign, setUtmCampaign,
    generatedUtmUrl,
    addRule,
    toggleRule,
    deleteRule,
    updateTags,
    publishRelease,
    rollback,
    saveMetadata,
    saveExpiration,
    savePassword,
    savePixels,
    toggleCloaking,
    saveWebhook,
    testWebhook,
    previewRouting,
    deleteLink,
    applyUtmPreset,
  }
}

export type CampaignControls = ReturnType<typeof useCampaignControls>
