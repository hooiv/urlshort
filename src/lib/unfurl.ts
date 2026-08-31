import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export interface UnfurlResult {
  url: string
  title: string | null
  description: string | null
  image: string | null
  icon: string | null
  siteName: string | null
}

const MAX_REDIRECTS = 3
const TIMEOUT_MS = 4000
const MAX_BYTES = 512 * 1024 // 512 KB

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  )
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private/local destinations are not allowed')
  }
  if (isIP(host)) {
    const blocked = isIP(host) === 4 ? isPrivateIPv4(host) : isPrivateIPv6(host)
    if (blocked) throw new Error('Private IP destinations are not allowed')
    return
  }
  const results = await lookup(host, { all: true, verbatim: true })
  if (!results.length) throw new Error('Destination did not resolve')
  for (const result of results) {
    const blocked = result.family === 4 ? isPrivateIPv4(result.address) : isPrivateIPv6(result.address)
    if (blocked) throw new Error('Destination resolves to a private IP address')
  }
}

/**
 * Resolve relative or protocol-relative URLs into valid absolute URLs.
 */
function resolveUrl(relativeOrAbsolute: string | null | undefined, baseUrl: string): string | null {
  if (!relativeOrAbsolute) return null
  const trimmed = relativeOrAbsolute.trim()
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null
  try {
    const parsed = new URL(trimmed, baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/**
 * Fast, lightweight streaming HTML parser for meta tags and favicon.
 */
export function parseHtmlMetadata(html: string, pageUrl: string): UnfurlResult {
  let title: string | null = null
  let description: string | null = null
  let image: string | null = null
  let icon: string | null = null
  let siteName: string | null = null

  // 1. Title matching: <meta property="og:title"> -> <meta name="twitter:title"> -> <title>
  const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["']/i)
  if (ogTitleMatch?.[1]) {
    title = decodeHtmlEntities(ogTitleMatch[1])
  } else {
    const twitterTitleMatch = html.match(/<meta[^>]+(?:property|name)=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:title["']/i)
    if (twitterTitleMatch?.[1]) {
      title = decodeHtmlEntities(twitterTitleMatch[1])
    } else {
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleTagMatch?.[1]) {
        title = decodeHtmlEntities(titleTagMatch[1])
      }
    }
  }

  // 2. Description matching: og:description -> twitter:description -> description
  const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:description["']/i)
  if (ogDescMatch?.[1]) {
    description = decodeHtmlEntities(ogDescMatch[1])
  } else {
    const twitterDescMatch = html.match(/<meta[^>]+(?:property|name)=["']twitter:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:description["']/i)
    if (twitterDescMatch?.[1]) {
      description = decodeHtmlEntities(twitterDescMatch[1])
    } else {
      const standardDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
      if (standardDescMatch?.[1]) {
        description = decodeHtmlEntities(standardDescMatch[1])
      }
    }
  }

  // 3. Image matching: og:image -> twitter:image -> og:image:url
  const ogImageMatch = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::url)?["']/i)
  if (ogImageMatch?.[1]) {
    image = resolveUrl(decodeHtmlEntities(ogImageMatch[1]), pageUrl)
  } else {
    const twitterImageMatch = html.match(/<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image["']/i)
    if (twitterImageMatch?.[1]) {
      image = resolveUrl(decodeHtmlEntities(twitterImageMatch[1]), pageUrl)
    }
  }

  // 4. Site name
  const ogSiteNameMatch = html.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:site_name["']/i)
  if (ogSiteNameMatch?.[1]) {
    siteName = decodeHtmlEntities(ogSiteNameMatch[1])
  } else {
    try {
      siteName = new URL(pageUrl).hostname.replace(/^www\./, '')
    } catch {
      siteName = null
    }
  }

  // 5. Favicon icon: link rel="icon" | rel="shortcut icon" | rel="apple-touch-icon"
  const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i) ||
    html.match(/<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']+)["']/i)
  if (iconMatch?.[1]) {
    icon = resolveUrl(decodeHtmlEntities(iconMatch[1]), pageUrl)
  } else {
    // Default fallback to /favicon.ico at domain root
    try {
      const u = new URL(pageUrl)
      icon = `${u.protocol}//${u.host}/favicon.ico`
    } catch {
      icon = null
    }
  }

  return {
    url: pageUrl,
    title: title ? title.slice(0, 300) : null,
    description: description ? description.slice(0, 1000) : null,
    image,
    icon,
    siteName,
  }
}

/**
 * Fetch and unfurl page metadata with strict SSRF defense, streaming size cap, and redirects.
 */
export async function unfurlUrl(inputUrl: string): Promise<UnfurlResult> {
  let currentUrlStr = inputUrl.trim()
  if (!currentUrlStr.startsWith('http://') && !currentUrlStr.startsWith('https://')) {
    currentUrlStr = `https://${currentUrlStr}`
  }

  let parsed = new URL(currentUrlStr)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credential-bearing URLs are not allowed')
  }

  let finalUrl = currentUrlStr
  let htmlChunk = ''

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    parsed = new URL(finalUrl)
    await assertPublicHost(parsed)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(finalUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 QuickLink-Bot/2.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error('Redirect response missing Location header')
        finalUrl = new URL(location, finalUrl).toString()
        if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects')
        continue
      }

      if (!response.ok) {
        throw new Error(`Target responded with status ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
        // Not an HTML document (e.g. direct image or PDF), return domain baseline
        return {
          url: finalUrl,
          title: parsed.hostname,
          description: null,
          image: contentType.startsWith('image/') ? finalUrl : null,
          icon: `${parsed.protocol}//${parsed.host}/favicon.ico`,
          siteName: parsed.hostname.replace(/^www\./, ''),
        }
      }

      // Stream up to MAX_BYTES (e.g. 512KB is plenty to read all head/meta tags)
      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: false })
        let bytesReceived = 0

        while (bytesReceived < MAX_BYTES) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            bytesReceived += value.byteLength
            htmlChunk += decoder.decode(value, { stream: true })
            // If we have parsed past the </head> tag, we can terminate early
            if (htmlChunk.toLowerCase().includes('</head>')) {
              reader.cancel().catch(() => {})
              break
            }
          }
        }
      } else {
        htmlChunk = await response.text()
      }

      break
    } finally {
      clearTimeout(timeout)
    }
  }

  return parseHtmlMetadata(htmlChunk, finalUrl)
}
