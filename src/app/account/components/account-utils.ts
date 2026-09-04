import type { Url } from '@/app/account/components/types'

export const SHORTEN_PAGE_SIZE = 50
export const MAX_TAGS_PER_LINK = 10
export const MAX_API_KEY_NAME_LENGTH = 80
export const MAX_NAME_LENGTH = 80
export const MAX_LINK_TITLE_LENGTH = 200
export const MIN_PASSWORD_LENGTH = 12

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

/** Human-readable label for an audit action, falling back to title-cased raw action. */
export function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    'auth.register': 'Account created',
    'auth.login': 'Signed in',
    'auth.logout': 'Signed out',
    'routing_rule.create': 'Routing rule created',
    'destination_release.create': 'Destination release published',
  }
  return labels[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Split a comma-separated tags input into trimmed, de-duplicated tags capped at `max`. */
export function parseTagsInput(input: string, max: number = MAX_TAGS_PER_LINK): string[] {
  const seen = new Set<string>()
  for (const part of input.split(',')) {
    const tag = part.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    if (seen.size >= max) break
  }
  return [...seen]
}

export function buildShortenQuery(options: {
  take?: number
  search?: string
  tag?: string
  cursor?: string | null
}): string {
  const params = new URLSearchParams({ take: String(options.take ?? SHORTEN_PAGE_SIZE) })
  const search = (options.search ?? '').trim()
  if (search) params.set('search', search)
  if (options.tag) params.set('tag', options.tag)
  if (options.cursor) params.set('cursor', options.cursor)
  return params.toString()
}

/** Only http(s) destinations are valid link targets. */
export function isValidDestinationUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Href for rendering a stored destination; never allows javascript:/data: execution. */
export function safeDestinationHref(value: string): string {
  return isValidDestinationUrl(value) ? value : '#'
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Returns an error message for invalid auth input, or null when the input is submittable. */
export function validateAuthInput(input: {
  mode: 'login' | 'register'
  email: string
  password: string
  name?: string
}): string | null {
  if (!EMAIL_PATTERN.test(normalizeEmail(input.email))) return 'Enter a valid email address'
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH)
    return 'Password must be at least 12 characters'
  if (input.mode === 'register' && (input.name ?? '').trim().length > MAX_NAME_LENGTH)
    return 'Name must be 80 characters or fewer'
  return null
}

/** Returns an error message for an invalid API key name, or null when submittable. */
export function validateApiKeyName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Give the key a name'
  if (trimmed.length > MAX_API_KEY_NAME_LENGTH) return 'Key name must be 80 characters or fewer'
  return null
}

/** Returns an error message for an invalid link edit, or null when the edit is submittable. */
export function validateLinkEdit(input: {
  title: string
  destination: string
  tagsInput: string
}): string | null {
  if (input.title.trim().length > MAX_LINK_TITLE_LENGTH)
    return 'Title must be 200 characters or fewer'
  if (!input.destination.trim()) return 'Destination URL is required'
  if (!isValidDestinationUrl(input.destination)) return 'Destination must be a valid http(s) URL'
  void input.tagsInput
  return null
}

/** Extract the prefilled invitee email (?email=) from a location search string. */
export function extractInvitedEmail(search: string): string | null {
  try {
    const email = (new URLSearchParams(search).get('email') ?? '').trim()
    return email || null
  } catch {
    return null
  }
}

export function summarizeLinks(links: Pick<Url, 'clicks' | 'isActive'>[]): {
  total: number
  active: number
  average: number
} {
  const total = links.reduce(
    (sum, link) => sum + (Number.isFinite(link.clicks) ? link.clicks : 0),
    0,
  )
  const active = links.filter((link) => link.isActive).length
  return { total, active, average: links.length ? Math.round(total / links.length) : 0 }
}
