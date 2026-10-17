import { filterForwardedParams, type QueryForwardMode } from '@/lib/query-forwarding'
import { reserveDailyClick } from '@/lib/daily-click-cap'
import { effectiveRedirectStatus } from '@/lib/redirect-status'
import { applyRobotsHeader } from '@/lib/robots-header'
import { NextRequest, NextResponse, after } from 'next/server'
import { isWithinActiveHours, type ActiveHours } from '@/lib/active-hours'
import { linkWindowState, notStartedTarget } from '@/lib/link-schedule'
import { prisma } from '@/lib/prisma'
import { appendClickId } from '@/lib/click-id-param'
import { appendAttribution, createAttributionToken, hashVisitorId } from '@/lib/attribution'
import { isCountryAllowed, type GeoFence } from '@/lib/geo-fence'
import { chooseSmartRule, getAiAgent, getBrowser, getCountry, getDeviceType, getLanguage, getOperatingSystem, getReferrerHost, getTrafficType, getTrafficConfidence, getVisitorId } from '@/lib/smart-routing'
import { getBaseUrl } from '@/lib/utils'
import { getLinkByCode, getLinkByDomainPath, getLatestRevision } from '@/lib/link-cache'
import { clickQueue } from '@/lib/queue'
import { chooseWeightedVariant, getRunningCampaignForUrl } from '@/lib/campaigns'
import { admitBillableClick, returnAdmittedClick } from '@/lib/click-admission'
import { resolveIpGeolocation } from '@/lib/ip-geolocation'
import { verifyUnlockToken } from '@/lib/password-gate'
import { activePixels, pixelConsentGranted, pixelContentSecurityPolicy, renderPixelRedirectPage } from '@/lib/retargeting-pixels'
import { getDomainFallbacks } from '@/lib/domain-settings'
import { buildOgMetaTags } from '@/lib/og-preview'
import { escapeHtml, forwardQueryParams, isBillableTraffic, jsString, resolveDestination } from '@/lib/redirect'

/** Per-domain 404 fallback; any lookup failure degrades to the default 404 page. */
async function domainNotFoundTarget(host: string, baseUrl: string): Promise<URL> {
  try {
    const fallbacks = await getDomainFallbacks(host)
    if (fallbacks?.notFoundUrl) return new URL(fallbacks.notFoundUrl)
  } catch { /* fall through */ }
  return new URL('/404', baseUrl)
}

function utcDateKey(date: Date): string { return date.toISOString().slice(0, 10) }

/**
 * Resolve the request host defensively. `x-forwarded-host` is client-spoofable,
 * so we only accept plausible public hostnames and fall back to the
 * (proxy-set) Host header otherwise.
 */
function requestHost(request: NextRequest): string {
  // NextRequest.url is derived from the platform's trusted request host. Do
  // not prefer x-forwarded-host: it is attacker-controlled when the app is
  // deployed behind a proxy that does not strip it.
  const candidate = request.nextUrl.hostname.toLowerCase().replace(/^www\./, '')
  return /^[a-z0-9.-]{1,253}$/.test(candidate) ? candidate : ''
}

function captureUtmParams(params: URLSearchParams): Record<string, string | null> {
  const get = (key: string) => {
    const value = params.get(key)?.trim()
    return value ? value.slice(0, 200) : null
  }
  return {
    utmSource: get('utm_source'),
    utmMedium: get('utm_medium'),
    utmCampaign: get('utm_campaign'),
    utmTerm: get('utm_term'),
    utmContent: get('utm_content'),
  }
}

function setVisitorCookie(response: NextResponse, visitorId: string): void {
  response.cookies.set('ql_visitor', visitorId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 90, path: '/' })
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await context.params
    const baseUrl = getBaseUrl()
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortCode)) {
      return NextResponse.redirect(new URL('/404', baseUrl), 307)
    }

    const host = requestHost(request)
    const appHost = new URL(baseUrl).hostname.toLowerCase().replace(/^www\./, '')
    let url = null
    if (host && host !== appHost) {
      url = await getLinkByDomainPath(host, `/${shortCode}`)
      if (!url) return NextResponse.redirect(await domainNotFoundTarget(host, baseUrl), 307)
    } else {
      url = await getLinkByCode(shortCode)
    }

    if (!url || !url.isActive) return NextResponse.redirect(new URL('/404', baseUrl), 307)
    if (url.riskStatus === 'blocked') return NextResponse.redirect(new URL('/blocked', baseUrl), 307)

    if (url.passwordHash) {
      const unlocked = verifyUnlockToken(url.shortCode, request.cookies.get(`ql_unlocked_${url.shortCode}`)?.value, url.passwordHash)
      if (!unlocked) {
        return NextResponse.redirect(new URL(`/protected/${url.shortCode}`, baseUrl), 307)
      }
    }

    if (linkWindowState(url) === 'scheduled') {
      return NextResponse.redirect(notStartedTarget(url, baseUrl), 307)
    }

    if (url.geoFence && !isCountryAllowed(url.geoFence as GeoFence, getCountry(request))) {
      return NextResponse.redirect(new URL('/region-unavailable', baseUrl), 307)
    }

    if (url.activeHours && !isWithinActiveHours(url.activeHours as ActiveHours)) {
      return NextResponse.redirect(url.offHoursUrl || new URL('/coming-soon', baseUrl).toString(), 307)
    }

    if (url.expiresAt && new Date() > url.expiresAt) {
      if (url.expiredUrl) {
        return NextResponse.redirect(url.expiredUrl, 307)
      }
      return NextResponse.redirect(new URL('/expired', baseUrl), 307)
    }

    const now = new Date()
    const visitor = getVisitorId(request)
    const visitorIdHash = hashVisitorId(visitor.id)
    const userAgent = request.headers.get('user-agent')
    const deviceType = getDeviceType(userAgent)
    const os = getOperatingSystem(userAgent)
    const language = getLanguage(request)
    const trafficType = getTrafficType(userAgent)
    const aiAgent = getAiAgent(userAgent)
    const country = getCountry(request)
    const referrerHost = getReferrerHost(request)
    const rule = chooseSmartRule(url.rules, { country, deviceType, referrerHost, now, os, language, trafficType, aiAgent }, url.shortCode, visitor.id)

    // Campaign lookup is cached (5s TTL, single-flight) and skipped entirely
    // when a smart-routing rule already decided the destination.
    const campaign = rule ? null : await getRunningCampaignForUrl(url.id, now)
    const campaignVariant = campaign ? chooseWeightedVariant(campaign.variants, `${url.shortCode}:${visitor.id}:campaign:${campaign.version}`) : null
    const revision = rule || campaignVariant ? null : await getLatestRevision(url.id)

    let destination: string
    try {
      destination = forwardQueryParams(
        resolveDestination({
          ruleUrl: rule?.destinationUrl,
          campaignUrl: campaignVariant?.destinationUrl,
          revisionUrl: revision?.destinationUrl,
          fallbackUrl: url.originalUrl,
        }),
        filterForwardedParams(request.nextUrl.searchParams, { mode: url.queryForwardMode as QueryForwardMode, allow: url.queryForwardAllow })
      )
    } catch {
      // A corrupt destination is a broken link, not an infrastructure outage.
      return NextResponse.redirect(new URL('/404', baseUrl), 307)
    }

    const dateKey = utcDateKey(now)
    const utm = captureUtmParams(request.nextUrl.searchParams)

    // Admit the click before accepting the redirect. Tenant quotas and
    // per-link max-click caps are both hard admission controls; a unit taken
    // from the tenant lease is handed back if the link cap then rejects. The
    // asynchronous queue receives a marker so it does not charge the same
    // click a second time during accounting.
    //
    // Automated crawler traffic is never billable: bots are logged for
    // analytics transparency but skip quota and max-clicks reservation so a
    // shared link cannot die (or burn budget) before any human arrives.
    // Links with no quota and no click cap skip admission entirely.
    const billable = isBillableTraffic(trafficType)
    const needsQuota = billable && url.workspaceId !== null
    const needsCap = billable && url.maxClicks !== null
    const needsDailyCap = billable && url.dailyClickCap != null
    let usageReserved = false
    const rejectOverLimit = () => url!.expiredUrl
      ? NextResponse.redirect(url!.expiredUrl, 307)
      : NextResponse.redirect(new URL('/expired', baseUrl), 307)
    if (needsQuota && url.workspaceId) {
      // Served from a per-instance lease of pre-reserved units: no row lock
      // or transaction per click (see click-admission.ts).
      const admission = await admitBillableClick(url.workspaceId)
      if (!admission.admitted) return rejectOverLimit()
      usageReserved = admission.reserved
    }
    if (needsCap && url.maxClicks !== null) {
      // Single conditional UPDATE (autocommit): exact per-link cap without a
      // transaction round trip.
      const reservation = await prisma.url.updateMany({
        where: { id: url.id, clicksReserved: { lt: url.maxClicks } },
        data: { clicksReserved: { increment: 1 } },
      })
      if (reservation.count !== 1) {
        if (usageReserved && url.workspaceId) returnAdmittedClick(url.workspaceId)
        return rejectOverLimit()
      }
    }
    if (needsDailyCap && url.dailyClickCap != null) {
      // Atomic per-UTC-day counter: one conditional UPDATE that also rolls the
      // counter over when the day changes (see daily-click-cap.ts).
      const admitted = await reserveDailyClick(prisma, url.id, url.dailyClickCap, dateKey)
      if (!admitted) {
        if (needsCap) await prisma.url.updateMany({ where: { id: url.id, clicksReserved: { gt: 0 } }, data: { clicksReserved: { decrement: 1 } } })
        if (usageReserved && url.workspaceId) returnAdmittedClick(url.workspaceId)
        return rejectOverLimit()
      }
    }

    // Record the click in the background using `after` so the redirect is
    // completely non-blocking (0ms added latency). We generate the ID locally
    // to instantly embed it in the attribution token.
    //
    // Webhook fan-out happens exactly once, downstream in the durable click
    // queue after the event is persisted — never here, so a slow consumer or
    // a failed persist can neither delay the redirect nor double-deliver.
    const clickEventId = crypto.randomUUID()
    const referer = request.headers.get('referer')
    const ip = request.headers.get('x-real-ip') || request.headers.get('x-client-ip')

    // Crawlers never execute the destination page, so attributing them only
    // pollutes the token stream — and a per-visitor token must never be
    // served under a shared cache key. Bots get the canonical destination.
    const isBot = trafficType === 'bot'
    const attributionToken = isBot ? null : createAttributionToken({ urlId: url.id, shortCode: url.shortCode, clickEventId, visitorIdHash, issuedAt: Date.now() })
    // Click-id passthrough is per visitor, so (like the attribution token) bots get the canonical URL.
    const withClickId = isBot ? destination : appendClickId(destination, url.clickIdParam, clickEventId)
    const finalDestination = attributionToken ? appendAttribution(withClickId, attributionToken) : withClickId

    // Resolve the click's country. The CDN-provided country header is the
    // fast path; when it is absent (XX) we fall back to an IP-geolocation
    // lookup. This runs inside `after` so it never adds latency to the
    // redirect itself.
    const resolvedCountry = country === 'XX' ? null : country
    after(async () => {
      let geoCountry: string | null = resolvedCountry
      if (geoCountry === null) {
        try {
          const geo = await resolveIpGeolocation(ip)
          geoCountry = geo?.country ?? null
        } catch {
          geoCountry = null
        }
      }
      clickQueue.push({
        clickEventId,
        urlId: url!.id,
        ruleId: rule?.id,
        campaignVariantId: campaignVariant?.id || null,
        ip,
        userAgent,
        referer,
        referrerHost,
        country: geoCountry,
        deviceType,
        trafficType,
        aiAgent,
        trafficConfidence: getTrafficConfidence(userAgent),
        os,
        browser: getBrowser(userAgent),
        language,
        ...utm,
        visitorIdHash,
        privacySignal: request.headers.get('sec-gpc')?.trim() === '1' || request.headers.get('dnt')?.trim() === '1',
        dateKey,
        shortCode: url!.shortCode,
        usageReserved,
        nonBillable: !billable,
      }).catch(err => console.error('Queue push failed:', err))
    })

    const dynamicOgImage = `${baseUrl}/api/links/${url.shortCode}/og`

    if (deviceType === 'bot') {
      const escapedUrl = escapeHtml(finalDestination)
      const scriptUrl = jsString(finalDestination)

      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    ${buildOgMetaTags({ title: url.title, description: url.description, image: url.ogImage || dynamicOgImage, canonical: finalDestination })}
    <meta http-equiv="refresh" content="0; url=${escapedUrl}" />
  </head>
  <body>
    <p>Redirecting to <a href="${escapedUrl}">${escapedUrl}</a>...</p>
    <script>window.location.replace(${scriptUrl});</script>
  </body>
</html>`

      const response = new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          // The markup embeds a per-request destination: it must never sit
          // in a shared cache, or visitors would inherit each other's URLs.
          'Cache-Control': 'private, no-store',
        },
      })
      if (visitor.isNew) setVisitorCookie(response, visitor.id)
      return response
    }

    const pixels = pixelConsentGranted({
      gpc: request.headers.get('sec-gpc'),
      dnt: request.headers.get('dnt'),
      cookie: request.headers.get('cookie'),
    }) ? activePixels(url) : []

    if (url.cloaked) {
      const escapedUrl = escapeHtml(finalDestination)
      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(url.title || 'Link')}</title>
    <style>body,html{margin:0;padding:0;height:100%;overflow:hidden;} iframe{width:100%;height:100%;border:none;}</style>
  </head>
  <body><iframe src="${escapedUrl}" allow="fullscreen"></iframe></body>
</html>`
      const response = new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
      })
      if (visitor.isNew) setVisitorCookie(response, visitor.id)
      return response
    }

    if (pixels.length > 0) {
      const response = new NextResponse(renderPixelRedirectPage({ destination: finalDestination, pixels }), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy': pixelContentSecurityPolicy(),
          'Referrer-Policy': 'origin',
        },
      })
      if (visitor.isNew) setVisitorCookie(response, visitor.id)
      return applyRobotsHeader(response)
    }

    const status = effectiveRedirectStatus(url.redirectStatus, { ruleMatched: destination !== url.originalUrl, gated: isBot || needsCap || !!url.expiresAt || !!url.startsAt || !!url.activeHours || !!url.passwordHash })
    const response = NextResponse.redirect(finalDestination, status)
    // Permanent codes are meant to be cached by browsers/CDNs; only the temporary ones are no-store.
    response.headers.set('Cache-Control', status === 301 || status === 308 ? 'public, max-age=3600' : 'private, no-store')
    if (visitor.isNew) setVisitorCookie(response, visitor.id)
    return applyRobotsHeader(response)
  } catch (error) {
    console.error('Error redirecting short link:', error)
    // Distinguish infrastructure failure from "not found": serve a 503 page so
    // outages aren't masked as broken links.
    return NextResponse.redirect(new URL('/503', getBaseUrl()), 307)
  }
}
