import { describe, expect, it } from 'vitest'
import { shapeHygiene } from './link-hygiene'

describe('shapeHygiene', () => {
  it('converts bigint and null counts to numbers', () => {
    const r = shapeHygiene({ total: 10n, active: 8n, archived: 2n, destinationDown: 1n, destinationDegraded: null, expired: 0, expiringSoon: 3n, scheduled: 0n, clickLimitReached: 1n, flaggedRisky: null, untagged: 4n, passwordProtected: 2n })
    expect(r).toEqual({ total: 10, active: 8, archived: 2, destinationDown: 1, destinationDegraded: 0, expired: 0, expiringSoon: 3, scheduled: 0, clickLimitReached: 1, flaggedRisky: 0, untagged: 4, passwordProtected: 2 })
  })
})
