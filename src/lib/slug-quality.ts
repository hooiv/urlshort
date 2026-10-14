/**
 * Readability audit for short codes: flags characters that are easy to
 * misread when spoken, printed or typed from a QR/print ad.
 */
export interface SlugQuality {
  score: number // 0-100
  issues: string[]
}

const AMBIGUOUS = /[0oO1lI]/g

export function assessSlugQuality(code: string): SlugQuality {
  const issues: string[] = []
  let score = 100
  if (code.length > 20) {
    issues.push('Longer than 20 characters; hard to type or say aloud')
    score -= 25
  }
  const amb = code.match(AMBIGUOUS)
  if (amb && amb.length > 0 && /[0-9]/.test(code) && /[a-zA-Z]/.test(code)) {
    issues.push('Mixes look-alike characters (0/O, 1/l/I)')
    score -= Math.min(30, amb.length * 10)
  }
  if (/(.)\1{2,}/.test(code)) {
    issues.push('Repeats a character three or more times')
    score -= 15
  }
  if (/[A-Z]/.test(code) && /[a-z]/.test(code)) {
    issues.push('Mixed case is easy to mistype')
    score -= 15
  }
  if (/[-_]{2,}|^[-_]|[-_]$/.test(code)) {
    issues.push('Awkward separators')
    score -= 10
  }
  return { score: Math.max(0, score), issues }
}
