import { describe, expect, it, vi } from 'vitest'
import { loadWorkspacePolicy, policyErrorMessage } from './link-policy-store'
import { linkPolicySchema } from './link-policy'

const db = (policy: string | null) => ({ workspaceLinkPolicy: { findUnique: vi.fn().mockResolvedValue(policy === null ? null : { workspaceId: 'w', policy }) } }) as never

describe('link policy store', () => {
  it('returns null when no policy is stored', async () => {
    expect(await loadWorkspacePolicy(db(null), 'w')).toBeNull()
  })
  it('fails open on corrupt rows', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await loadWorkspacePolicy(db('{nope'), 'w')).toBeNull()
    expect(await loadWorkspacePolicy(db('{"minSlugLength":0}'), 'w')).toBeNull()
    spy.mockRestore()
  })
  it('round-trips and reports violations in one message', async () => {
    const stored = JSON.stringify(linkPolicySchema.parse({ requireHttps: true, requiredTags: ['q4'] }))
    const policy = await loadWorkspacePolicy(db(stored), 'w')
    expect(await policyErrorMessage(policy, { destination: 'http://a.com', tags: [] })).toBe('Workspace link policy: Destination must use https; Missing required tag: q4')
    expect(await policyErrorMessage(policy, { destination: 'https://a.com', tags: ['Q4'] })).toBeNull()
    expect(await policyErrorMessage(null, { destination: 'x' })).toBeNull()
  })
})
