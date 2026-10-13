import { describe, expect, it } from 'vitest'
import { scopeFilter } from './aggregate-analytics'

describe('scopeFilter trash exclusion', () => {
  it.each([
    [{ kind: 'user', userId: 'u1' } as const],
    [{ kind: 'workspace', workspaceId: 'w1' } as const],
    [{ kind: 'user', userId: 'u1', tag: 'x' } as const],
  ])('excludes trashed links for %j', (scope) => {
    expect(scopeFilter(scope as never).sql).toContain('u."deletedAt" IS NULL')
  })
})
