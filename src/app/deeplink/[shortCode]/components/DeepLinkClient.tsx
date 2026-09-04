'use client'

import { useEffect, useState } from 'react'
import {
  buildDeepLinkResolverUrl,
  isSafeDeepLinkTarget,
  pickDeepLinkFallback,
  shouldAutoOpenNative,
  type DeepLinkFallback,
} from '@/app/deeplink/[shortCode]/components/deeplink-logic'

export default function DeepLinkClient({ shortCode }: { shortCode: string }) {
  const [fallback, setFallback] = useState<DeepLinkFallback>({ openHref: '/', storeHref: '/', webHref: '/' })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let backgrounded = false
    let revealTimer: ReturnType<typeof setTimeout> | undefined

    const onBlur = () => {
      backgrounded = true
    }
    window.addEventListener('blur', onBlur, { once: true })

    fetch(buildDeepLinkResolverUrl(shortCode), { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('resolver')
        const payload = await response.json()
        if (controller.signal.aborted) return
        setFallback(pickDeepLinkFallback(payload))
        setReady(true)
        if (shouldAutoOpenNative(payload) && typeof payload.url === 'string') {
          window.location.href = payload.url
          revealTimer = setTimeout(() => {
            if (!backgrounded) setReady(true)
          }, 1200)
        } else if (typeof payload.url === 'string' && isSafeDeepLinkTarget(payload.url)) {
          window.location.replace(payload.url)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFailed(true)
        setReady(true)
      })

    return () => {
      controller.abort()
      window.removeEventListener('blur', onBlur)
      if (revealTimer) clearTimeout(revealTimer)
    }
  }, [shortCode])

  return (
    <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
      <h1 className="text-2xl font-semibold">Opening app…</h1>
      <p className="mt-3 text-slate-400">Resolving the best native destination.</p>
      {!ready && !failed && (
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
        </div>
      )}
      {(ready || failed) && (
        <div className="mt-6 space-y-3">
          <a href={fallback.openHref} className="block rounded-xl bg-blue-600 px-4 py-3 font-medium">
            Open app
          </a>
          <a href={fallback.storeHref} className="block rounded-xl bg-slate-800 px-4 py-3">
            Open store
          </a>
          <a href={fallback.webHref} className="block rounded-xl border border-slate-700 px-4 py-3">
            Continue in browser
          </a>
        </div>
      )}
    </section>
  )
}
