import { describe, expect, it } from 'vitest'
import { shapeHygiene } from './link-hygiene'

describe('shapeHygiene', () => {
  it('converts bigint and null counts to numbers', () => {
    const r = shapeHygiene({ total: 10n, active: 8n, archived: 2n, destinationDown: 1n, destinationDegraded: null, expired: 0, expiringSoon: 3n, scheduled: 0n, clickLimitReached: 1n, flaggedRisky: null, untagged: 4n, passwordProtected: 2n })
    expect(r).toEqual({ total: 10, active: 8, archived: 2, destinationDown: 1, destinationDegraded: 0, expired: 0, expiringSoon: 3, scheduled: 0, clickLimitReached: 1, flaggedRisky: 0, untagged: 4, passwordProtected: 2 })
  })
})

import { scoreHygiene, type LinkHygiene } from './link-hygiene'
const zero: LinkHygiene = { total: 0, active: 0, archived: 0, destinationDown: 0, destinationDegraded: 0, expired: 0, expiringSoon: 0, scheduled: 0, clickLimitReached: 0, flaggedRisky: 0, untagged: 0, passwordProtected: 0 }
describe('scoreHygiene', () => {
  it('scores empty and clean workspaces 100', () => {
    expect(scoreHygiene(zero)).toEqual({ score: 100, grade: 'A', penalties: [] })
    expect(scoreHygiene({ ...zero, total: 10, active: 10 }).score).toBe(100)
  })
  it('weights down destinations heaviest and sorts penalties', () => {
    const r = scoreHygiene({ ...zero, active: 10, destinationDown: 3, untagged: 10 })
    expect(r.penalties[0].issue).toBe('destinationDown')
    expect(r.penalties[0].points).toBe(12)
    expect(r.score).toBe(83)
  })
  it('clamps at 0 and caps share at 1', () => {
    const r = scoreHygiene({ ...zero, active: 1, destinationDown: 5, flaggedRisky: 5, expired: 5, destinationDegraded: 5, clickLimitReached: 5, expiringSoon: 5, untagged: 5 })
    expect(r.score).toBe(0)
    expect(r.grade).toBe('F')
  })
})
