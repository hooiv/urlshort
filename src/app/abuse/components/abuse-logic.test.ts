import { describe, expect, it } from 'vitest'
import {
  buildReportPayload,
  extractShortCode,
  getApiErrorMessage,
  getRiskLabel,
  getRiskTone,
  parseScanResponse,
  validateReportInput,
  validateScanInput,
} from './abuse-logic'

describe('extractShortCode', () => {
  it('returns bare codes trimmed', () => {
    expect(extractShortCode('  abc1234  ')).toBe('abc1234')
  })

  it('takes the last path segment of a pasted URL', () => {
    expect(extractShortCode('https://quicklink.to/abc1234')).toBe('abc1234')
    expect(extractShortCode('https://quicklink.to/abc1234/')).toBe('abc1234')
  })

  it('strips query strings and fragments the old split("/") kept', () => {
    expect(extractShortCode('https://quicklink.to/abc1234?utm_source=x#frag')).toBe('abc1234')
    expect(extractShortCode('abc1234?x=1')).toBe('abc1234')
  })

  it('decodes percent-encoding and tolerates bad escapes', () => {
    expect(extractShortCode('summer%2Dsale')).toBe('summer-sale')
    expect(extractShortCode('%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('returns empty for blank or slash-only input', () => {
    expect(extractShortCode('   ')).toBe('')
    expect(extractShortCode('///')).toBe('')
  })
})

describe('validateScanInput', () => {
  it('requires input', () => {
    expect(validateScanInput('   ')).toBe('Enter a short code or link URL')
  })

  it('rejects over-long codes before hitting the API', () => {
    expect(validateScanInput('x'.repeat(65))).toBe('Short code is too long')
  })

  it('rejects codes with whitespace or angle brackets', () => {
    expect(validateScanInput('abc 123')).toBe('Short code contains invalid characters')
    expect(validateScanInput('<script>')).toBe('Short code contains invalid characters')
  })

  it('accepts bare codes and full URLs', () => {
    expect(validateScanInput('abc1234')).toBeNull()
    expect(validateScanInput('https://quicklink.to/abc1234?utm=x')).toBeNull()
  })
})

describe('validateReportInput', () => {
  const base = { shortCode: 'abc1234', reason: 'phishing', details: '', reporterEmail: '' }

  it('requires a short code (accepting pasted URLs)', () => {
    expect(validateReportInput({ ...base, shortCode: '   ' })).toBe(
      'Enter the short code to report',
    )
    expect(validateReportInput({ ...base, shortCode: 'https://q.to/abc1234' })).toBeNull()
  })

  it('rejects unknown reasons and over-long details', () => {
    expect(validateReportInput({ ...base, reason: 'nope' })).toBe(
      'Select a valid violation category',
    )
    expect(validateReportInput({ ...base, details: 'x'.repeat(2001) })).toBe(
      'Details must be 2000 characters or fewer',
    )
  })

  it('validates the optional reporter email', () => {
    expect(validateReportInput({ ...base, reporterEmail: 'not-an-email' })).toBe(
      'Contact email looks invalid',
    )
    expect(validateReportInput({ ...base, reporterEmail: 'a@b.co' })).toBeNull()
  })
})

describe('buildReportPayload', () => {
  it('sends the extracted code and omits empty optionals (same API shape)', () => {
    expect(
      buildReportPayload({
        shortCode: 'https://q.to/abc1234/',
        reason: 'spam',
        details: '   ',
        reporterEmail: '',
      }),
    ).toEqual({ shortCode: 'abc1234', reason: 'spam' })
  })

  it('includes trimmed details and reporter when provided', () => {
    expect(
      buildReportPayload({
        shortCode: ' abc1234 ',
        reason: 'malware',
        details: '  evil  ',
        reporterEmail: ' r@x.co ',
      }),
    ).toEqual({ shortCode: 'abc1234', reason: 'malware', details: 'evil', reporter: 'r@x.co' })
  })
})

describe('parseScanResponse', () => {
  it('narrows a valid body and defaults missing riskStatus to cleared', () => {
    expect(parseScanResponse({ shortCode: 'abc', originalUrl: 'https://e.com' })).toMatchObject({
      shortCode: 'abc',
      riskStatus: 'cleared',
    })
  })

  it('keeps review/blocked statuses and drops invalid bodies', () => {
    expect(parseScanResponse({ shortCode: 'a', riskStatus: 'blocked' })?.riskStatus).toBe('blocked')
    expect(parseScanResponse(null)).toBeNull()
    expect(parseScanResponse({ shortCode: '  ' })).toBeNull()
    expect(parseScanResponse({ shortCode: 'a', riskStatus: 'evil' })?.riskStatus).toBe('cleared')
  })
})

describe('getApiErrorMessage / risk helpers', () => {
  it('prefers the server error string with a fallback', () => {
    expect(getApiErrorMessage({ error: 'Link not found' }, 'Scan failed')).toBe('Link not found')
    expect(getApiErrorMessage(null, 'Scan failed')).toBe('Scan failed')
  })

  it('maps tones and labels including the blocked state the page hid', () => {
    expect(getRiskTone('blocked')).toBe('blocked')
    expect(getRiskLabel('blocked')).toBe('Blocked')
    expect(getRiskTone(undefined)).toBe('safe')
    expect(getRiskLabel(undefined)).toBe('Cleared / Safe')
  })
})
