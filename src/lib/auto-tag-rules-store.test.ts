import { describe, expect, it, vi } from 'vitest'
import { loadAutoTagRules } from './auto-tag-rules-store'

const db = (rules: string | null) => ({ workspaceAutoTagRules: { findUnique: vi.fn().mockResolvedValue(rules === null ? null : { workspaceId: 'w', rules }) } }) as never

describe('auto-tag rules store', () => {
  it('returns [] when unset', async () => { expect(await loadAutoTagRules(db(null), 'w')).toEqual([]) })
  it('fails open on corrupt or invalid rows', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await loadAutoTagRules(db('{x'), 'w')).toEqual([])
    expect(await loadAutoTagRules(db('[{"tags":["a"]}]'), 'w')).toEqual([])
    spy.mockRestore()
  })
  it('returns valid rules', async () => {
    const r = [{ host: 'youtube.com', tags: ['video'] }]
    expect(await loadAutoTagRules(db(JSON.stringify(r)), 'w')).toEqual(r)
  })
})
