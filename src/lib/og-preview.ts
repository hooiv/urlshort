import { escapeHtml } from '@/lib/redirect'

export const OG_TITLE_MAX = 200
export const OG_DESCRIPTION_MAX = 300
export const OG_IMAGE_MAX = 2048

export type OgInput = { title?: unknown; description?: unknown; ogImage?: unknown }
export type OgFields = { title: string | null; description: string | null; ogImage: string | null }

function clean(v: unknown, max: number, label: string): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') throw new Error(`${label} must be a string`)
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (!s) return null
  if (s.length > max) throw new Error(`${label} must be at most ${max} characters`)
  return s
}

/** Validates an OG image URL: absolute https (http allowed only for localhost), no credentials. */
export function validateOgImageUrl(v: unknown): string | null {
  const s = clean(v, OG_IMAGE_MAX, 'ogImage')
  if (!s) return null
  let u: URL
  try { u = new URL(s) } catch { throw new Error('ogImage must be an absolute URL') }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('ogImage must use https')
  if (u.username || u.password) throw new Error('ogImage must not contain credentials')
  return u.toString()
}

export function validateOgFields(input: OgInput): Partial<OgFields> {
  const out: Partial<OgFields> = {}
  if (input.title !== undefined) out.title = clean(input.title, OG_TITLE_MAX, 'title')
  if (input.description !== undefined) out.description = clean(input.description, OG_DESCRIPTION_MAX, 'description')
  if (input.ogImage !== undefined) out.ogImage = validateOgImageUrl(input.ogImage)
  return out
}

/** Meta tags served to social crawlers only. All values are HTML-escaped. */
export function buildOgMetaTags(o: { title: string | null; description: string | null; image: string; canonical: string; siteName?: string }): string {
  const t = escapeHtml(o.title || 'Link')
  const img = escapeHtml(o.image)
  const tags = [
    `<title>${t}</title>`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(o.siteName || 'QuickLink')}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:url" content="${escapeHtml(o.canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ]
  if (o.description) {
    const d = escapeHtml(o.description)
    tags.push(`<meta name="description" content="${d}" />`, `<meta property="og:description" content="${d}" />`, `<meta name="twitter:description" content="${d}" />`)
  }
  return tags.join('\n    ')
}
