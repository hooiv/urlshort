import { assessSlugQuality, type SlugQuality } from '@/lib/slug-quality'

export const MAX_AVAILABILITY_CODES = 50
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export type SlugStatus = 'available' | 'taken' | 'invalid' | 'duplicate'

export interface SlugAvailability {
  code: string
  status: SlugStatus
  quality?: SlugQuality
}

/**
 * Classify candidate short codes. `takenLower` holds lowercase codes that
 * already exist (short codes are matched case-insensitively). Input order is
 * preserved; repeated candidates are flagged rather than silently dropped.
 */
export function classifySlugs(codes: string[], takenLower: ReadonlySet<string>): SlugAvailability[] {
  const seen = new Set<string>()
  return codes.map((raw) => {
    const code = raw.trim()
    if (!CODE_RE.test(code)) return { code, status: 'invalid' as const }
    const key = code.toLowerCase()
    if (seen.has(key)) return { code, status: 'duplicate' as const }
    seen.add(key)
    if (takenLower.has(key)) return { code, status: 'taken' as const }
    return { code, status: 'available' as const, quality: assessSlugQuality(code) }
  })
}

export function validCandidates(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim()).filter((c) => CODE_RE.test(c)))]
}
