import { isReservedCode } from '@/lib/utils'
import { assessSlugQuality, type SlugQuality } from '@/lib/slug-quality'

export const MAX_AVAILABILITY_CODES = 50
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export type SlugStatus = 'available' | 'taken' | 'reserved' | 'invalid' | 'duplicate'

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
    if (isReservedCode(code)) return { code, status: 'reserved' as const }
    if (takenLower.has(key)) return { code, status: 'taken' as const }
    return { code, status: 'available' as const, quality: assessSlugQuality(code) }
  })
}

export function validCandidates(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim()).filter((c) => CODE_RE.test(c)))]
}

/**
 * Suggest up to `limit` free alternatives for a taken or reserved code.
 * Deterministic (no randomness) so the same input yields the same list:
 * numeric suffixes, then short descriptive suffixes. Every suggestion is
 * valid, not reserved and not in `takenLower`.
 */
export function suggestAlternatives(
  code: string,
  takenLower: ReadonlySet<string>,
  limit = 5,
): string[] {
  const base = code.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 56)
  if (!base) return []
  const words = ['go', 'link', 'now', 'hq', 'app', 'new']
  const candidates: string[] = []
  for (let i = 2; i <= 9; i++) candidates.push(`${base}${i}`)
  for (const w of words) candidates.push(`${base}-${w}`)
  for (const y of [new Date().getUTCFullYear()]) candidates.push(`${base}-${y}`)
  const out: string[] = []
  for (const c of candidates) {
    if (out.length >= limit) break
    if (!CODE_RE.test(c) || isReservedCode(c) || takenLower.has(c.toLowerCase())) continue
    out.push(c)
  }
  return out
}
