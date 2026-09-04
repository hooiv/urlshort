import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendAttribution, createAttributionToken, hashVisitorId } from '@/lib/attribution'
import { chooseSmartRule, getAiAgent, getBrowser, getCountry, getDeviceType, getLanguage, getOperatingSystem, getReferrerHost, getTrafficType, getTrafficConfidence, getVisitorId } from '@/lib/smart-routing'
import { getBaseUrl } from '@/lib/utils'
import { getLinkByCode, getLinkByDomainPath, getLatestRevision } from '@/lib/link-cache'
import { clickQueue } from '@/lib/queue'
import { chooseWeightedVariant, getRunningCampaignForUrl } from '@/lib/campaigns'
import { reserveUsageInTransaction } from '@/lib/tenant-usage'
import { resolveIpGeolocation } from '@/lib/ip-geolocation'
import { verifyUnlockToken } from '@/lib/password-gate'
import { escapeHtml, forwardQueryParams, isBillableTraffic, jsString, resolveDestination } from '@/lib/redirect'

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
      if (!url) return NextResponse.redirect(new URL('/404', baseUrl), 307)
    } else {
      url = await getLinkByCode(shortCode)
    }

    if (!url || !url.isActive) return NextResponse.redirect(new URL('/404', baseUrl), 307)
    if (url.riskStatus === 'blocked') return NextResponse.redirect(new URL('/blocked', baseUrl), 307)

    if (url.passwordHash) {
      const unlocked = verifyUnlockToken(url.shortCode, request.cookies.get(`ql_unlocked_${url.shortCode}`)?.value)
      if (!unlocked) {
        return NextResponse.redirect(new URL(`/protected/${url.shortCode}`, baseUrl), 307)
      }
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
        request.nextUrl.searchParams
      )
    } catch {
      // A corrupt destination is a broken link, not an infrastructure outage.
      return NextResponse.redirect(new URL('/404', baseUrl), 307)
    }

    const dateKey = utcDateKey(now)
    const utm = captureUtmParams(request.nextUrl.searchParams)

    // Admit the click before accepting the redirect. Tenant quotas and
    // per-link max-click caps are both hard admission controls, so they must
    // commit (or roll back) together; otherwise a rejected request could still
    // consume one of the two budgets. The asynchronous queue receives a marker
    // so it does not charge the same click a second time during accounting.
    //
    // Automated crawler traffic is never billable: bots are logged for
    // analytics transparency but skip quota and max-clicks reservation so a
    // shared link cannot die (or burn budget) before any human arrives.
    // Links with no quota and no click cap skip the transaction entirely.
    const billable = isBillableTraffic(trafficType)
    const needsQuota = billable && url.workspaceId !== null
    const needsCap = billable && url.maxClicks !== null
    let usageReserved = false
    if (needsQuota || needsCap) {
      const admitted = await prisma.$transaction(async tx => {
        if (needsQuota && url.workspaceId) {
          const usage = await reserveUsageInTransaction(tx, url.workspaceId, 'clicks')
          if (!usage.allowed) return false
          usageReserved = true
        }
        if (needsCap && url.maxClicks !== null) {
          const reservation = await tx.url.updateMany({
            where: {
              id: url.id,
              OR: [
                { maxClicks: null },
                { clicksReserved: { lt: url.maxClicks } },
              ],
            },
            data: { clicksReserved: { increment: 1 } },
          })
          if (reservation.count !== 1) return false
        }
        return true
      })
      if (!admitted) {
        return url.expiredUrl
          ? NextResponse.redirect(url.expiredUrl, 307)
          : NextResponse.redirect(new URL('/expired', baseUrl), 307)
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
    const finalDestination = attributionToken ? appendAttribution(destination, attributionToken) : destination

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
        dateKey,
        shortCode: url!.shortCode,
        usageReserved,
        nonBillable: !billable,
      }).catch(err => console.error('Queue push failed:', err))
    })

    const escapedOgImage = url.ogImage ? escapeHtml(url.ogImage) : ''
    const dynamicOgImage = `${baseUrl}/api/links/${url.shortCode}/og`
    const finalOgImage = escapedOgImage || dynamicOgImage

    if (deviceType === 'bot') {
      const escapedTitle = escapeHtml(url.title || 'Link')
      const escapedDescription = escapeHtml(url.description || '')
      const escapedUrl = escapeHtml(finalDestination)
      const scriptUrl = jsString(finalDestination)

      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    ${url.description ? `<meta name="description" content="${escapedDescription}" />` : ''}
    <meta property="og:title" content="${escapedTitle}" />
    ${url.description ? `<meta property="og:description" content="${escapedDescription}" />` : ''}
    <meta property="og:image" content="${finalOgImage}" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    ${url.description ? `<meta name="twitter:description" content="${escapedDescription}" />` : ''}
    <meta name="twitter:image" content="${finalOgImage}" />
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

    if (url.metaPixelId || url.googleTagId || url.xPixelId || url.cloaked) {
      const escapedUrl = escapeHtml(finalDestination)
      const scriptUrl = jsString(finalDestination)
      const escapedTitle = escapeHtml(url.title || 'Link')

      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${url.cloaked ? escapedTitle : 'Redirecting...'}</title>
    ${url.cloaked ? `<style>body,html{margin:0;padding:0;height:100%;overflow:hidden;} iframe{width:100%;height:100%;border:none;}</style>` : ''}
    ${url.metaPixelId ? `
    <!-- Meta Pixel Code -->
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${escapeHtml(url.metaPixelId)}');
    fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${escapeHtml(url.metaPixelId)}&ev=PageView&noscript=1" /></noscript>
    ` : ''}
    ${url.googleTagId ? `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(url.googleTagId)}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${escapeHtml(url.googleTagId)}');
    </script>
    ` : ''}
    ${url.xPixelId ? `
    <!-- X Pixel Code -->
    <script>
    !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
    },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
    a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
    twq('config','${escapeHtml(url.xPixelId)}');
    </script>
    ` : ''}
    ${!url.cloaked ? `<meta http-equiv="refresh" content="1; url=${escapedUrl}" />` : ''}
  </head>
  <body>
    ${url.cloaked
      ? `<iframe src="${escapedUrl}" allow="fullscreen"></iframe>`
      : `<script>
          setTimeout(function() {
            window.location.replace(${scriptUrl});
          }, 500);
         </script>`
    }
  </body>
</html>`

      const response = new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      })
      if (visitor.isNew) setVisitorCookie(response, visitor.id)
      return response
    }

    const response = NextResponse.redirect(finalDestination, 307)
    response.headers.set('Cache-Control', 'private, no-store')
    if (visitor.isNew) setVisitorCookie(response, visitor.id)
    return response
  } catch (error) {
    console.error('Error redirecting short link:', error)
    // Distinguish infrastructure failure from "not found": serve a 503 page so
    // outages aren't masked as broken links.
    return NextResponse.redirect(new URL('/503', getBaseUrl()), 307)
  }
}
