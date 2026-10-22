import { describe, expect, it } from 'vitest'
import { Prisma, type Url } from '@prisma/client'
import { cloneUrlData, validateCloneCode } from './link-clone'

describe('validateCloneCode', () => {
  it('accepts empty as auto-generate', () => {
    expect(validateCloneCode(undefined)).toEqual({ ok: true, code: null })
    expect(validateCloneCode('')).toEqual({ ok: true, code: null })
  })
  it('accepts valid codes', () => expect(validateCloneCode('my-link_2')).toEqual({ ok: true, code: 'my-link_2' }))
  it('rejects bad shapes', () => {
    for (const bad of ['ab', 'a b', 'x'.repeat(41), '../etc', 5]) expect(validateCloneCode(bad).ok).toBe(false)
  })
})

describe('cloneUrlData', () => {
  const source = {
    id: 'u1', originalUrl: 'https://example.com/a', shortCode: 'orig', title: 't', description: 'd', ogImage: null,
    clicks: 99, clicksReserved: 3, milestoneReached: 100, publicStatsHash: 'h', publicStatsEnabledAt: new Date(),
    passwordHash: 'secret', managementTokenHash: 'tok', webhookUrl: 'https://hook.example', healthStatus: 'down',
    expiresAt: null, expiredUrl: null, startsAt: null, notStartedUrl: null, maxClicks: 10,
    metaPixelId: '1', googleTagId: null, xPixelId: null, linkedinPartnerId: null, tiktokPixelId: null, pinterestTagId: null,
    cloaked: true, isActive: true, userId: 'user', workspaceId: 'ws', folderId: 'f', deepLinkAppId: null,
    autoFailoverEnabled: true, tags: ['a', 'b'], deletedAt: null,
  } as unknown as Url

  it('copies the visitor blocklist, using DB null when absent', () => {
    const rules = { countries: ['XX'] }
    expect(cloneUrlData({ ...source, visitorBlock: rules } as unknown as Url, 'c').visitorBlock).toEqual(rules)
    expect(cloneUrlData({ ...source, visitorBlock: null } as unknown as Url, 'c').visitorBlock).toBe(Prisma.DbNull)
  })

  it('copies routing settings: geo fence, active hours, redirect status, query forwarding, daily cap', () => {
    const geo = { mode: 'deny', countries: ['US'] }
    const hours = { tz: 'UTC', start: 9, end: 17 }
    const withRouting = { ...source, geoFence: geo, activeHours: hours, offHoursUrl: 'https://example.com/off', redirectStatus: 301, queryForwardMode: 'allow', queryForwardAllow: ['utm_source'], clickIdParam: 'cid', dailyClickCap: 50 } as unknown as Url
    expect(cloneUrlData(withRouting, 'c')).toMatchObject({ geoFence: geo, activeHours: hours, offHoursUrl: 'https://example.com/off', redirectStatus: 301, queryForwardMode: 'allow', queryForwardAllow: ['utm_source'], clickIdParam: 'cid', dailyClickCap: 50 })
    const none = { ...source, geoFence: null, activeHours: null } as unknown as Url
    expect(cloneUrlData(none, 'c')).toMatchObject({ geoFence: Prisma.DbNull, activeHours: Prisma.DbNull })
  })

  it('copies settings under the new code', () => {
    const d = cloneUrlData(source, 'copy')
    expect(d).toMatchObject({ shortCode: 'copy', originalUrl: source.originalUrl, tags: ['a', 'b'], folderId: 'f', workspaceId: 'ws', maxClicks: 10, cloaked: true, metaPixelId: '1' })
  })
  it('never copies counters, secrets, health or sharing state', () => {
    const d = cloneUrlData(source, 'copy') as Record<string, unknown>
    for (const key of ['clicks', 'clicksReserved', 'milestoneReached', 'publicStatsHash', 'passwordHash', 'managementTokenHash', 'webhookUrl', 'healthStatus', 'deletedAt', 'id']) {
      expect(key in d).toBe(false)
    }
  })
})

import { validateBulkCloneCodes as _vb } from './link-clone'
describe('validateBulkCloneCodes', () => {
  it('dedupes and accepts valid codes', () => {
    expect(_vb({ codes: ['abc', 'abc', 'x-y_z'] })).toEqual({ ok: true, codes: ['abc', 'x-y_z'] })
  })
  it('rejects empty, oversize, malformed and non-object bodies', () => {
    expect(_vb({ codes: [] }).ok).toBe(false)
    expect(_vb({ codes: Array.from({ length: 51 }, (_, i) => `code${i}`) }).ok).toBe(false)
    expect(_vb({ codes: ['a b'] }).ok).toBe(false)
    expect(_vb({ codes: [5] }).ok).toBe(false)
    expect(_vb(null).ok).toBe(false)
    expect(_vb([]).ok).toBe(false)
  })
})
