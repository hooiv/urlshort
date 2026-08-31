import { describe, expect, it } from 'vitest'
import { aggregateClicks, type ClickData } from './queue'
import { webhookEndpointScope, webhookBackoffMs, WEBHOOK_MAX_RETRIES } from './webhooks'

function click(overrides: Partial<ClickData> = {}): ClickData {
  return {
    clickEventId: `c_${Math.random().toString(36).slice(2)}`,
    urlId: 'url_1',
    dateKey: '2026-08-26',
    shortCode: 'abc',
    ...overrides,
  }
}

describe('aggregateClicks', () => {
  it('returns empty aggregations for an empty batch', () => {
    const { perUrl, perDay } = aggregateClicks([])
    expect(perUrl.size).toBe(0)
    expect(perDay.size).toBe(0)
  })

  it('groups counts per URL across clicks', () => {
    const items = [
      click(),
      click({ clickEventId: 'c2' }),
      click({ urlId: 'url_2', shortCode: 'xyz' }),
    ]
    const { perUrl } = aggregateClicks(items)
    expect(perUrl.get('url_1')).toEqual({ count: 2, shortCode: 'abc' })
    expect(perUrl.get('url_2')).toEqual({ count: 1, shortCode: 'xyz' })
  })

  it('splits daily rollups by (urlId, dateKey) and accumulates counts', () => {
    const items = [
      click(),
      click({ clickEventId: 'c2' }),
      click({ clickEventId: 'c3', dateKey: '2026-08-27' }),
      click({ clickEventId: 'c4', urlId: 'url_2', shortCode: 'xyz' }),
    ]
    const { perDay } = aggregateClicks(items)
    expect(perDay.size).toBe(3)
    expect(perDay.get('url_1|2026-08-26')).toMatchObject({ count: 2 })
    expect(perDay.get('url_1|2026-08-27')).toMatchObject({ count: 1 })
    expect(perDay.get('url_2|2026-08-26')).toMatchObject({ count: 1 })
  })

  it('keeps the first shortCode observed per URL id (stable for cache eviction)', () => {
    const items = [click({ shortCode: 'first' }), click({ clickEventId: 'c2', shortCode: 'second' })]
    const { perUrl } = aggregateClicks(items)
    expect(perUrl.get('url_1')?.shortCode).toBe('first')
  })
})

describe('webhookEndpointScope (tenant isolation)', () => {
  it('scopes to workspace when only workspaceId is present', () => {
    expect(webhookEndpointScope({ workspaceId: 'ws_1', userId: null })).toEqual([{ workspaceId: 'ws_1' }])
  })

  it('scopes to user when only userId is present', () => {
    expect(webhookEndpointScope({ workspaceId: null, userId: 'u_1' })).toEqual([{ userId: 'u_1' }])
  })

  it('matches either owner when both are present', () => {
    expect(webhookEndpointScope({ workspaceId: 'ws_1', userId: 'u_1' })).toEqual([
      { workspaceId: 'ws_1' },
      { userId: 'u_1' },
    ])
  })

  it('never matches anything without ownership (fails closed, no cross-tenant leak)', () => {
    expect(webhookEndpointScope({ workspaceId: null, userId: null })).toBeUndefined()
  })
})

describe('webhookBackoffMs', () => {
  it('grows exponentially (5x per attempt) starting at 5 minutes', () => {
    expect(webhookBackoffMs(1)).toBe(5 * 60_000)
    expect(webhookBackoffMs(2)).toBe(25 * 60_000)
    expect(webhookBackoffMs(3)).toBe(125 * 60_000)
  })

  it('clamps nonsensical attempt numbers to the first backoff step', () => {
    expect(webhookBackoffMs(0)).toBe(webhookBackoffMs(1))
    expect(webhookBackoffMs(-4)).toBe(webhookBackoffMs(1))
  })

  it('exports a sane retry cap', () => {
    expect(WEBHOOK_MAX_RETRIES).toBeGreaterThanOrEqual(3)
    expect(WEBHOOK_MAX_RETRIES).toBeLessThanOrEqual(10)
  })
})
