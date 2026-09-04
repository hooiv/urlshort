'use client'

import { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  buildShortenPayload,
  emptyShortenForm,
  validateShortenInput,
  type ShortenFormState,
  type SplitRuleInput,
} from '@/app/components/shorten-logic'

export interface ShortenedUrl {
  id: string
  originalUrl: string
  shortCode: string
  shortUrl: string
  managementUrl: string
  title?: string | null
  description?: string | null
  ogImage?: string | null
  clicks: number
  createdAt: string
}

export function useCreateShortLink() {
  const [form, setForm] = useState<ShortenFormState>(emptyShortenForm)
  const [isLoading, setIsLoading] = useState(false)
  const [shortenedUrl, setShortenedUrl] = useState<ShortenedUrl | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  const patch = useCallback((update: Partial<ShortenFormState>) => {
    setForm((current) => ({ ...current, ...update }))
  }, [])

  const applyUtmPreset = useCallback(
    (source: string, medium: string, campaign: string) => {
      patch({ utmSource: source, utmMedium: medium, utmCampaign: campaign })
    },
    [patch],
  )

  const addSplitVariant = useCallback(() => {
    setForm((current) => ({
      ...current,
      splitRules: [...current.splitRules, { id: Date.now(), url: '', weight: 50 }],
    }))
  }, [])

  const updateSplitVariant = useCallback((index: number, update: Partial<SplitRuleInput>) => {
    setForm((current) => {
      const next = [...current.splitRules]
      next[index] = { ...next[index], ...update }
      return { ...current, splitRules: next }
    })
  }, [])

  const removeSplitVariant = useCallback((id: number) => {
    setForm((current) => ({ ...current, splitRules: current.splitRules.filter((r) => r.id !== id) }))
  }, [])

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (isLoading) return
      const error = validateShortenInput(form)
      if (error) {
        toast.error(error)
        return
      }
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setIsLoading(true)
      try {
        const response = await fetch('/api/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildShortenPayload(form)),
          signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not create link')
        setShortenedUrl(data)
        setForm(emptyShortenForm())
        toast.success('Smart link created!')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        if (inFlight.current === controller) inFlight.current = null
        setIsLoading(false)
      }
    },
    [form, isLoading],
  )

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const area = document.createElement('textarea')
        area.value = text
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Clipboard access failed')
    }
  }, [])

  return {
    form,
    patch,
    setForm,
    isLoading,
    shortenedUrl,
    submit,
    applyUtmPreset,
    addSplitVariant,
    updateSplitVariant,
    removeSplitVariant,
    copyToClipboard,
  }
}
