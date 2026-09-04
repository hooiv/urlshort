'use client'

/* eslint-disable react-hooks/set-state-in-effect -- campaign data is remote state synchronized after mount. */
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { Campaign, CampaignAction, LinkOption } from './types'
import {
  buildCreatePayload,
  campaignActionRequest,
  newIdempotencyKey,
  resolvePrimaryUrlId,
  validateCampaignForm,
  type CampaignFormInput,
} from './campaignLogic'

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [links, setLinks] = useState<LinkOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [primaryUrlId, setPrimaryUrlId] = useState('')

  // Sequence + abort guards: only the latest fetch may write state, so rapid
  // Refresh clicks or a slow-then-fast action pair cannot resurrect stale rows.
  const loadSeq = useRef(0)
  const loadAbort = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    loadAbort.current?.abort()
    const controller = new AbortController()
    loadAbort.current = controller
    setLoading(true)
    setError(null)
    try {
      const [campaignResponse, linkResponse] = await Promise.all([
        fetch('/api/campaigns', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/shorten?take=100', { cache: 'no-store', signal: controller.signal }),
      ])
      const [campaignPayload, linkPayload] = await Promise.all([
        campaignResponse.json(),
        linkResponse.json(),
      ])
      if (controller.signal.aborted || seq !== loadSeq.current) return
      if (!campaignResponse.ok) throw new Error(campaignPayload.error || 'Unable to load campaigns')
      if (!linkResponse.ok) throw new Error(linkPayload.error || 'Unable to load links')
      const freshLinks: LinkOption[] = linkPayload.links || []
      setCampaigns(Array.isArray(campaignPayload) ? campaignPayload : [])
      setLinks(freshLinks)
      setPrimaryUrlId((current) => resolvePrimaryUrlId(current, freshLinks))
    } catch (err) {
      if (controller.signal.aborted || seq !== loadSeq.current) return
      const message = err instanceof Error ? err.message : 'Unable to load campaign control plane'
      // AbortError here means a newer load superseded us — stay silent.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(message)
      toast.error(message)
    } finally {
      if (seq === loadSeq.current && !controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      loadAbort.current?.abort()
    }
  }, [load])

  async function createCampaign(input: CampaignFormInput): Promise<boolean> {
    const validationError = validateCampaignForm(input)
    if (validationError) {
      toast.error(validationError)
      return false
    }
    if (input.primaryUrlId && !links.some((link) => link.id === input.primaryUrlId)) {
      toast.error('That short link no longer exists — pick another entry link')
      await load()
      return false
    }
    setCreating(true)
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': newIdempotencyKey() },
        body: JSON.stringify(buildCreatePayload(input)),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Campaign creation failed')
      toast.success('Campaign created and attached to the entry link')
      await load()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Campaign creation failed')
      return false
    } finally {
      setCreating(false)
    }
  }

  async function campaignAction(id: string, action: CampaignAction) {
    setBusyId(id)
    try {
      const request = campaignActionRequest(id, action)
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Campaign action failed')
      toast.success(
        action === 'autopilot'
          ? payload.reason || 'Autopilot evaluated the campaign'
          : action === 'start'
            ? 'Campaign is now live'
            : 'Campaign paused'
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Campaign action failed')
    } finally {
      setBusyId((current) => (current === id ? null : current))
    }
  }

  return {
    campaigns,
    links,
    loading,
    error,
    creating,
    busyId,
    primaryUrlId,
    setPrimaryUrlId,
    load,
    createCampaign,
    campaignAction,
  }
}
