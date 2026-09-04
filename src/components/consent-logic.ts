export const CONSENT_COOKIE_NAME = 'ql_consent'
export type ConsentChoice = 'essential' | 'analytics'

export function parseConsentChoice(cookieHeader: string | null | undefined): ConsentChoice | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    if (name !== CONSENT_COOKIE_NAME) continue
    const value = part.slice(idx + 1).trim()
    if (value === 'essential' || value === 'analytics') return value
    return null
  }
  return null
}

export function shouldShowConsentBanner(cookieHeader: string | null | undefined): boolean {
  return parseConsentChoice(cookieHeader) === null
}

export function buildConsentCookie(value: ConsentChoice): string {
  return `${CONSENT_COOKIE_NAME}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`
}
