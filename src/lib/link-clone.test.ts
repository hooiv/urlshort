import { describe, expect, it } from 'vitest'
import type { Url } from '@prisma/client'
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
    metaPixelId: '1', googleTagId: null, xPixelId: null, linkedinPartnerId: null, tiktokPixelId: null,
    cloaked: true, isActive: true, userId: 'user', workspaceId: 'ws', folderId: 'f', deepLinkAppId: null,
    autoFailoverEnabled: true, tags: ['a', 'b'], deletedAt: null,
  } as unknown as Url

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
