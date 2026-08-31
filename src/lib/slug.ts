import { isReservedCode } from './utils'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with', 'from',
  'is', 'are', 'was', 'were', 'it', 'this', 'that', 'your', 'my', 'our', 'all', 'how', 'what',
  'why', 'when', 'who', 'which', 'where', 'into', 'about', 'over', 'after',
])

function cleanToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Generate semantic, memorable slug suggestions from a link's title or destination URL.
 */
export function generateSlugSuggestions(
  title: string | null | undefined,
  destinationUrl: string | null | undefined
): string[] {
  const suggestions = new Set<string>()

  // 1. From Title
  if (title && title.trim()) {
    const rawTokens = title.split(/[\s\-_:,|./\\]+/).map(cleanToken).filter(Boolean)
    const filteredTokens = rawTokens.filter((t) => !STOP_WORDS.has(t) && t.length >= 2)

    const tokensToUse = filteredTokens.length >= 1 ? filteredTokens : rawTokens
    if (tokensToUse.length > 0) {
      // Variant A: first 2-3 words
      const fullKebab = tokensToUse.slice(0, 3).join('-')
      if (fullKebab.length >= 3 && !isReservedCode(fullKebab)) {
        suggestions.add(fullKebab.slice(0, 32))
      }

      // Variant B: first 2 words + current year
      const year = new Date().getFullYear()
      const yearKebab = `${tokensToUse.slice(0, 2).join('-')}-${year}`
      if (yearKebab.length >= 3 && !isReservedCode(yearKebab)) {
        suggestions.add(yearKebab.slice(0, 32))
      }

      // Variant C: "get-" or "go-" prefix if single keyword
      if (tokensToUse.length === 1) {
        const getKebab = `get-${tokensToUse[0]}`
        if (!isReservedCode(getKebab)) suggestions.add(getKebab)
      }
    }
  }

  // 2. From Destination URL pathname or domain
  if (destinationUrl && destinationUrl.trim()) {
    try {
      const u = new URL(destinationUrl.includes('://') ? destinationUrl : `https://${destinationUrl}`)
      const pathSegments = u.pathname.split('/').map(cleanToken).filter(Boolean)
      const pathFiltered = pathSegments.filter((s) => !STOP_WORDS.has(s) && s.length >= 2)

      if (pathFiltered.length > 0) {
        const lastSegment = pathFiltered[pathFiltered.length - 1]
        if (lastSegment.length >= 3 && !isReservedCode(lastSegment)) {
          suggestions.add(lastSegment.slice(0, 32))
        }

        if (pathFiltered.length >= 2) {
          const combo = `${pathFiltered[0]}-${pathFiltered[pathFiltered.length - 1]}`
          if (combo.length >= 3 && !isReservedCode(combo)) {
            suggestions.add(combo.slice(0, 32))
          }
        }
      }

      // Domain base keyword (e.g. github.com -> github)
      const domainParts = u.hostname.replace(/^www\./, '').split('.')
      if (domainParts.length >= 2) {
        const brand = domainParts[0]
        if (brand.length >= 3 && !isReservedCode(brand)) {
          suggestions.add(brand)
        }
      }
    } catch {
      // Ignore invalid URL
    }
  }

  return [...suggestions].filter((s) => /^[a-z0-9][a-z0-9-_]{1,31}[a-z0-9]$/i.test(s)).slice(0, 5)
}
