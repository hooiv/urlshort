/**
 * Pure abuse-portal logic: short-code extraction, client-side validation,
 * report payload building, and scan-response parsing.
 *
 * Kept separate from the React page so it is unit-testable in the node
 * vitest environment (no DOM). Mirrors POST /api/abuse/report
 * (`abuseReportSchema`: shortCode 1..64, reason enum, details <= 2000,
 * reporter <= 254).
 */

export const ABUSE_REASONS = ['phishing', 'malware', 'spam', 'copyright', 'other'] as const

export type AbuseReason = (typeof ABUSE_REASONS)[number]

export type RiskStatus = 'cleared' | 'review' | 'blocked'

export interface ScanResult {
  shortCode: string
  originalUrl?: string
  riskStatus?: RiskStatus
  riskReason?: string | null
  isActive?: boolean
}

export interface ReportFormInput {
  shortCode: string
  reason: string
  details: string
  reporterEmail: string
}

export const MAX_SHORT_CODE_LENGTH = 64
export const MAX_DETAILS_LENGTH = 2000
export const MAX_REPORTER_LENGTH = 254

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isAbuseReason(value: string): value is AbuseReason {
  return (ABUSE_REASONS as readonly string[]).includes(value)
}

/**
 * Extract a short code from raw user input. Accepts a bare code
 * ("abc1234") or a pasted link URL ("https://quicklink.to/abc1234?utm=x#frag").
 * Strips query strings, hashes, and trailing slashes before decoding.
 */
export function extractShortCode(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  let candidate = trimmed
  if (candidate.includes('/')) {
    const segments = candidate.split('/').filter((part) => part.length > 0)
    if (segments.length === 0) return ''
    candidate = segments[segments.length - 1]
  }
  // Drop ?query and #fragment that naive split('/') would otherwise keep.
  candidate = candidate.split(/[?#]/, 1)[0].trim()
  if (!candidate) return ''
  try {
    candidate = decodeURIComponent(candidate).trim()
  } catch {
    // Keep the raw candidate when it is not valid percent-encoding.
  }
  return candidate
}

export function validateScanInput(raw: string): string | null {
  if (!raw.trim()) return 'Enter a short code or link URL'
  const code = extractShortCode(raw)
  if (!code) return 'Enter a short code or link URL'
  if (code.length > MAX_SHORT_CODE_LENGTH) return 'Short code is too long'
  if (/[\s<>]/.test(code)) return 'Short code contains invalid characters'
  return null
}

export function validateReportInput(input: ReportFormInput): string | null {
  const code = extractShortCode(input.shortCode)
  if (!code) return 'Enter the short code to report'
  if (code.length > MAX_SHORT_CODE_LENGTH) return 'Short code is too long'
  if (!isAbuseReason(input.reason)) return 'Select a valid violation category'
  if (input.details.trim().length > MAX_DETAILS_LENGTH) {
    return `Details must be ${MAX_DETAILS_LENGTH} characters or fewer`
  }
  const reporter = input.reporterEmail.trim()
  if (reporter) {
    if (reporter.length > MAX_REPORTER_LENGTH) return 'Contact email is too long'
    if (!EMAIL_PATTERN.test(reporter)) return 'Contact email looks invalid'
  }
  return null
}

export interface ReportPayload {
  shortCode: string
  reason: AbuseReason
  details?: string
  reporter?: string
}

/** Build the exact POST /api/abuse/report body. Run validateReportInput first. */
export function buildReportPayload(input: ReportFormInput): ReportPayload {
  const details = input.details.trim()
  const reporter = input.reporterEmail.trim()
  return {
    shortCode: extractShortCode(input.shortCode),
    reason: input.reason as AbuseReason,
    ...(details ? { details } : {}),
    ...(reporter ? { reporter } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Narrow an unknown GET /api/links/:code body into a ScanResult, or null. */
export function parseScanResponse(data: unknown): ScanResult | null {
  if (!isRecord(data)) return null
  const shortCode = data['shortCode']
  if (typeof shortCode !== 'string' || !shortCode.trim()) return null
  const result: ScanResult = { shortCode: shortCode.trim() }
  if (typeof data['originalUrl'] === 'string' && data['originalUrl'].trim()) {
    result.originalUrl = data['originalUrl']
  }
  const riskStatus = data['riskStatus']
  if (riskStatus === 'cleared' || riskStatus === 'review' || riskStatus === 'blocked') {
    result.riskStatus = riskStatus
  } else {
    result.riskStatus = 'cleared'
  }
  if (typeof data['riskReason'] === 'string' && data['riskReason'].trim()) {
    result.riskReason = data['riskReason']
  } else {
    result.riskReason = null
  }
  if (typeof data['isActive'] === 'boolean') result.isActive = data['isActive']
  return result
}

/** Pull a user-facing message out of an unknown API error body. */
export function getApiErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data['error'] === 'string' && data['error'].trim()) {
    return data['error']
  }
  return fallback
}

export type RiskTone = 'safe' | 'review' | 'blocked'

export function getRiskTone(status: RiskStatus | undefined): RiskTone {
  if (status === 'blocked') return 'blocked'
  if (status === 'review') return 'review'
  return 'safe'
}

export function getRiskLabel(status: RiskStatus | undefined): string {
  if (status === 'blocked') return 'Blocked'
  if (status === 'review') return 'Flagged for Review'
  return 'Cleared / Safe'
}
