'use client'

import { useEffect, useState } from 'react'

export type SlugSuggestion = { code: string; quality: unknown }

/** Debounced destination-derived short code suggestions; empty until the URL is a valid http(s) URL. */
export function useSlugSuggestions(url: string, delayMs = 600): string[] {
  const [state, setState] = useState<{ url: string; codes: string[] }>({ url: '', codes: [] })
  const trimmed = url.trim()
  const valid = /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(trimmed)

  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/slug-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as { suggestions?: SlugSuggestion[] }
        setState({ url: trimmed, codes: (data.suggestions ?? []).map((s) => s.code).slice(0, 4) })
      } catch {
        /* aborted or offline: suggestions are optional */
      }
    }, delayMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, valid, delayMs])

  return valid && state.url === trimmed ? state.codes : []
}
