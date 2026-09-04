import { describe, expect, it } from 'vitest'
import { isSweepAuthorized } from './route'

describe('isSweepAuthorized', () => {
  it('accepts the sweep header with the health secret', () => {
    expect(isSweepAuthorized('', 'sweep-secret', '', 'sweep-secret', 'cron-secret')).toBe(true)
  })

  it('accepts bearer with either secret', () => {
    expect(isSweepAuthorized('sweep-secret', '', '', 'sweep-secret', 'cron-secret')).toBe(true)
    expect(isSweepAuthorized('cron-secret', '', '', 'sweep-secret', 'cron-secret')).toBe(true)
    expect(isSweepAuthorized('', '', 'cron-secret', 'sweep-secret', 'cron-secret')).toBe(true)
  })

  it('rejects wrong secrets and empty config', () => {
    expect(isSweepAuthorized('wrong', 'wrong', 'wrong', 'sweep-secret', 'cron-secret')).toBe(false)
    expect(isSweepAuthorized('', '', '', undefined, undefined)).toBe(false)
    expect(isSweepAuthorized('cron-secret', '', '', undefined, 'cron-secret')).toBe(true)
  })
})
