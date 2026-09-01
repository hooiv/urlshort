import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendAttribution, createAttributionToken, hashVisitorId } from '@/lib/attribution'
import { chooseSmartRule, getAiAgent, getBrowser, getCountry, getDeviceType, getLanguage, getOperatingSystem, getReferrerHost, getTrafficType, getTrafficConfidence, getVisitorId } from '@/lib/smart-routing'
import { getBaseUrl } from '@/lib/utils'
import { getLinkByCode, getLinkByDomainPath, getLatestRevision } from '@/lib/link-cache'
import { clickQueue } from '@/lib/queue'
import { dispatchWebhooksForUrl } from '@/lib/webhooks'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { chooseWeightedVariant } from '@/lib/campaigns'
import { reserveUsageInTransaction } from '@/lib/tenant-usage'\nimport { resolveIpGeolocation } from '@/lib/ip-geolocation'

function utcDateKey(date: Date): string { return date.toISOString().slice(0, 10) }

/**
 * Merge incoming query params into the destination URL so campaign context
 * (utm_*, gclid, fbclid, …) survives the redirect. Params already present on
 * the destination win — the link owner's explicit values take precedence.
 */
function forwardQueryParams(destination: string, incoming: URLSearchParams): string {
  if (![...incoming.keys()].length) return destination
  const url = new URL(destination)
  for (const [key, value] of incoming) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  }
  return url.toString()
}

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

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await context.params
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortCode)) {
      return NextResponse.redirect(new URL('/404', getBaseUrl()), 307)
    }

    const host = requestHost(request)
    const appHost = new URL(getBaseUrl()).hostname.toLowerCase().replace(/^www\./, '')
    let url = null
    if (host && host !== appHost) {
      url = await getLinkByDomainPath(host, `/${shortCode}`)
      if (!url) return NextResponse.redirect(new URL('/404', getBaseUrl()), 307)
    } else {
      url = await getLinkByCode(shortCode)
    }

    if (!url || !url.isActive) return NextResponse.redirect(new URL('/404', getBaseUrl()), 307)
    if (url.riskStatus === 'blocked') return NextResponse.redirect(new URL('/blocked', getBaseUrl()), 307)

    if (url.passwordHash) {
      const { createHmac } = await import('node:crypto');
      const secret = process.env.QL_ATTRIBUTION_SECRET;
      const cookie = request.cookies.get(`ql_unlocked_${url.shortCode}`);
      let authorized = false;
      if (cookie && secret) {
        const expected = createHmac('sha256', secret).update(`unlock:${url.shortCode}`).digest('hex');
        if (cookie.value === expected) authorized = true;
      }
      if (!authorized) {
        return NextResponse.redirect(new URL(`/protected/${url.shortCode}`, getBaseUrl()), 307);
      }
    }

    if (url.expiresAt && new Date() > url.expiresAt) {
      if (url.expiredUrl) {
        return NextResponse.redirect(url.expiredUrl, 307)
      }
      return NextResponse.redirect(new URL('/expired', getBaseUrl()), 307)
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
    const campaign = await prisma.campaign.findFirst({ where: { status: 'running', links: { some: { urlId: url.id } }, OR: [{ startAt: null }, { startAt: { lte: now } }], AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }] }, include: { variants: true }, orderBy: { updatedAt: 'desc' } })
    const campaignVariant = rule ? null : campaign ? chooseWeightedVariant(campaign.variants, `${url.shortCode}:${visitor.id}:campaign:${campaign.version}`) : null
    const revision = rule ? null : await getLatestRevision(url.id)
    const dateKey = utcDateKey(now)
    const utm = captureUtmParams(request.nextUrl.searchParams)
    const destination = forwardQueryParams(rule?.destinationUrl || campaignVariant?.destinationUrl || revision?.destinationUrl || url.originalUrl, request.nextUrl.searchParams)

    // Admit the click before accepting the redirect. Tenant quotas and
    // per-link max-click caps are both hard admission controls, so they must
    // commit (or roll back) together; otherwise a rejected request could still
    // consume one of the two budgets. The asynchronous queue receives a marker
    // so it does not charge the same click a second time during accounting.
    let usageReserved = false
    const admitted = await prisma.$transaction(async tx => {
      if (url.workspaceId) {
        const usage = await reserveUsageInTransaction(tx, url.workspaceId, 'clicks')
        if (!usage.allowed) return false
        usageReserved = true
      }
      if (url.maxClicks !== null) {
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
        : NextResponse.redirect(new URL('/expired', getBaseUrl()), 307)
    }

    // Record the click in the background using `after` so the redirect is
    // completely non-blocking (0ms added latency). We generate the ID locally
    // to instantly embed it in the attribution token.
    const clickEventId = crypto.randomUUID()
    const referer = request.headers.get('referer')
    const ip = request.headers.get('x-real-ip') || request.headers.get('x-client-ip')

    const attributionToken = createAttributionToken({ urlId: url.id, shortCode: url.shortCode, clickEventId: clickEventId ?? '', visitorIdHash, issuedAt: Date.now() })
    const finalDestination = appendAttribution(destination, attributionToken)

    after(() => {
      clickQueue.push({
        clickEventId,
        urlId: url!.id,
        ruleId: rule?.id,
        campaignVariantId: campaignVariant?.id || null,
        ip,
        userAgent,
        referer,
        referrerHost,
        country: country === 'XX' ? geo?.country ?? null : country,
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
      }).catch(err => console.error('Queue push failed:', err))
      dispatchWebhooksForUrl(url!.id, 'link.clicked', {
        shortCode: url!.shortCode,
        destination: finalDestination,
        clickEventId,
        timestamp: now.toISOString(),
        visitor: visitorIdHash,
        country: country === 'XX' ? geo?.country ?? null : country,
        deviceType,
        referrer: referrerHost,
      }).catch(err => console.error('Enterprise webhook dispatch failed:', err))
    })
    const escapeHtml = (unsafe: string) => unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const escapedOgImage = url.ogImage ? escapeHtml(url.ogImage) : '';
    const dynamicOgImage = `${getBaseUrl()}/api/links/${url.shortCode}/og`;
    const finalOgImage = escapedOgImage || dynamicOgImage;
    
    if (deviceType === 'bot') {
      const escapedTitle = escapeHtml(url.title || 'Link')
      const escapedDescription = escapeHtml(url.description || '')
      const escapedUrl = escapeHtml(finalDestination)
      
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
    <script>window.location.replace("${escapedUrl}");</script>
  </body>
</html>`
      
      const response = new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
        },
      })
      if (visitor.isNew) response.cookies.set('ql_visitor', visitor.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 90, path: '/' })
      return response
    }

    if (url.metaPixelId || url.googleTagId || url.xPixelId || url.cloaked) {
      const escapeHtml = (unsafe: string) => unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      const escapedUrl = escapeHtml(finalDestination);
      const escapedTitle = escapeHtml(url.title || 'Link');
      
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
            window.location.replace("${escapedUrl}");
          }, 500);
         </script>`
    }
  </body>
</html>`;

      const response = new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      })
      if (visitor.isNew) response.cookies.set('ql_visitor', visitor.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 90, path: '/' })
      return response
    }

    const response = NextResponse.redirect(finalDestination, 307)
    response.headers.set('Cache-Control', 'private, no-store')
    if (visitor.isNew) response.cookies.set('ql_visitor', visitor.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 90, path: '/' })
    return response
  } catch (error) {
    console.error('Error redirecting short link:', error)
    // Distinguish infrastructure failure from "not found": serve a 503 page so
    // outages aren't masked as broken links.
    return NextResponse.redirect(new URL('/503', getBaseUrl()), 307)
  }
}



