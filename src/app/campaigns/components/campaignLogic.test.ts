import { describe, expect, it } from 'vitest'
import {
  buildBulkUrl,
  buildCreatePayload,
  calculateTotals,
  campaignActionRequest,
  clampPercent,
  formatEvidenceFloor,
  formatMoney,
  getActiveAnomalies,
  getLatestDecision,
  getLiveLink,
  isValidHttpUrl,
  isValidSlug,
  newIdempotencyKey,
  readWorkspaceIdFromSearch,
  resolvePrimaryUrlId,
  validateCampaignForm,
  variantAllocation,
} from './campaignLogic'

const variants = [
  { id: 'v1', name: 'Control', destinationUrl: 'https://a.test', weight: 70, clicks: 80, conversions: 8, valueCents: '5000', isControl: true },
  { id: 'v2', name: 'B', destinationUrl: 'https://b.test', weight: 30, clicks: 20, conversions: 4, valueCents: '12000', isControl: false },
]

describe('validateCampaignForm', () => {
  const base = {
    name: 'Spring launch',
    slug: 'spring-launch',
    primaryUrlId: 'clx1',
    objective: 'conversion_rate',
    autoOptimize: true,
    controlName: 'Control',
    variantName: 'Variant B',
    controlUrl: 'https://example.com/a',
    variantUrl: 'https://example.com/b',
  }

  it('accepts a well-formed campaign', () => {
    expect(validateCampaignForm(base)).toBeNull()
  })

  it('rejects missing entry link, bad slug, and non-http destinations', () => {
    expect(validateCampaignForm({ ...base, primaryUrlId: '' })).toMatch(/permanent short link/)
    expect(validateCampaignForm({ ...base, slug: 'Spring_Launch!' })).toMatch(/Slug/)
    expect(validateCampaignForm({ ...base, controlUrl: 'not a url' })).toMatch(/Control destination/)
    expect(validateCampaignForm({ ...base, variantUrl: 'ftp://files.test/x' })).toMatch(/Variant B destination/)
    expect(validateCampaignForm({ ...base, name: '   ' })).toMatch(/name/)
  })

  it('trims before validating so padded input passes', () => {
    expect(validateCampaignForm({ ...base, name: '  Spring  ', slug: '  spring-launch  ' })).toBeNull()
  })
})

describe('buildCreatePayload', () => {
  it('trims strings and keeps the 50/50 weight contract', () => {
    const payload = buildCreatePayload({
      name: '  Spring  ',
      slug: '  spring-launch ',
      primaryUrlId: 'clx1',
      objective: 'conversion_rate',
      autoOptimize: false,
      controlName: ' Control ',
      variantName: ' B ',
      controlUrl: ' https://a.test/ ',
      variantUrl: 'https://b.test/',
    })
    expect(payload).toMatchObject({ name: 'Spring', slug: 'spring-launch', primaryUrlId: 'clx1', autoOptimize: false })
    expect(payload.variants).toEqual([
      { name: 'Control', destinationUrl: 'https://a.test/', isControl: true, weight: 50 },
      { name: 'B', destinationUrl: 'https://b.test/', isControl: false, weight: 50 },
    ])
  })
})

describe('totals and allocation', () => {
  it('sums clicks/conversions and derives cvr', () => {
    expect(calculateTotals(variants)).toEqual({ totalClicks: 100, totalConversions: 12, cvr: 0.12 })
  })

  it('tolerates a missing variant list (list endpoint omits relations)', () => {
    expect(calculateTotals(undefined)).toEqual({ totalClicks: 0, totalConversions: 0, cvr: 0 })
  })

  it('uses observed share once data exists, configured weight before that', () => {
    expect(variantAllocation(variants[0], 100)).toBe(0.8)
    expect(variantAllocation(variants[0], 0)).toBe(0.7)
  })

  it('clamps bar widths so broken data cannot overflow the track', () => {
    expect(clampPercent(1.5)).toBe(100)
    expect(clampPercent(-1)).toBe(0)
    expect(clampPercent(NaN)).toBe(0)
  })
})

describe('relation guards', () => {
  it('treats missing decisions/anomalies/links as empty', () => {
    expect(getActiveAnomalies(undefined)).toEqual([])
    expect(getActiveAnomalies([{ resolvedAt: null } as never, { resolvedAt: '2026-01-01' } as never])).toHaveLength(1)
    expect(getLatestDecision(undefined)).toBeNull()
    expect(getLatestDecision([{ id: 'd1' } as never])).toMatchObject({ id: 'd1' })
    expect(getLiveLink(undefined)).toBeNull()
  })
})

describe('formatMoney', () => {
  it('honors campaign currency instead of hardcoding USD', () => {
    expect(formatMoney('5000', 'USD')).toBe((50).toLocaleString(undefined, { style: 'currency', currency: 'USD' }))
    expect(formatMoney('5000', 'EUR')).toBe((50).toLocaleString(undefined, { style: 'currency', currency: 'EUR' }))
  })

  it('never renders NaN for malformed valueCents', () => {
    expect(formatMoney('not-a-number', 'USD')).toBe((0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }))
    expect(formatMoney(undefined, undefined)).toBe((0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }))
  })

  it('falls back to USD for unknown currency codes', () => {
    expect(formatMoney('100', 'XX')).toBe((1).toLocaleString(undefined, { style: 'currency', currency: 'USD' }))
  })
})

describe('formatEvidenceFloor', () => {
  it('formats counts with thousands separators', () => {
    expect(formatEvidenceFloor(1000, 10)).toBe('1,000 / 10 conv')
  })
})

describe('bulk and action request builders', () => {
  it('omits workspaceId when empty so the API falls back to the default workspace', () => {
    expect(buildBulkUrl('')).toBe('/api/campaigns/bulk')
    expect(buildBulkUrl(null)).toBe('/api/campaigns/bulk')
    expect(buildBulkUrl('ws 1')).toBe('/api/campaigns/bulk?workspaceId=ws%201')
  })

  it('reads workspaceId without throwing on garbage', () => {
    expect(readWorkspaceIdFromSearch('?workspaceId=ws1')).toBe('ws1')
    expect(readWorkspaceIdFromSearch('{{{')).toBe('')
  })

  it('keeps the exact start/autopilot/pause call shapes', () => {
    expect(campaignActionRequest('c1', 'start')).toEqual({ url: '/api/campaigns/c1?action=start', method: 'POST' })
    expect(campaignActionRequest('c1', 'autopilot')).toEqual({ url: '/api/campaigns/c1?action=autopilot', method: 'POST' })
    const pause = campaignActionRequest('c1', 'pause')
    expect(pause).toMatchObject({ url: '/api/campaigns/c1', method: 'PATCH' })
    expect(JSON.parse(pause.body as string)).toEqual({ status: 'paused' })
  })
})

describe('resolvePrimaryUrlId', () => {
  const links = [
    { id: 'l1', shortCode: 'a', title: null, originalUrl: 'https://a.test', clicks: 0, healthStatus: 'ok' },
    { id: 'l2', shortCode: 'b', title: null, originalUrl: 'https://b.test', clicks: 0, healthStatus: 'ok' },
  ]

  it('keeps the selection when still present, else falls back to the first link', () => {
    expect(resolvePrimaryUrlId('l2', links)).toBe('l2')
    expect(resolvePrimaryUrlId('deleted', links)).toBe('l1')
    expect(resolvePrimaryUrlId('', [])).toBe('')
  })
})

describe('validators', () => {
  it('validates slugs and urls', () => {
    expect(isValidSlug('spring-launch')).toBe(true)
    expect(isValidSlug('Spring')).toBe(false)
    expect(isValidHttpUrl('https://example.com/x')).toBe(true)
    expect(isValidHttpUrl('ftp://example.com')).toBe(false)
    expect(isValidHttpUrl('not a url')).toBe(false)
  })

  it('mints unique idempotency keys', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })
})
