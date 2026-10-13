import { describe, expect, it } from 'vitest'
import { parseFolderWindow, shapeFolderStats } from './folder-performance'

describe('parseFolderWindow', () => {
  it('defaults and validates', () => {
    expect(parseFolderWindow(null)).toBe(30)
    expect(parseFolderWindow('7')).toBe(7)
    expect(parseFolderWindow('14')).toBeNull()
    expect(parseFolderWindow('x')).toBeNull()
  })
})

describe('shapeFolderStats', () => {
  it('names the unfiled row, computes change and share, orders by clicks', () => {
    const out = shapeFolderStats([
      { folderId: null, name: null, links: 3n, clicks: 20n, previous: 0n },
      { folderId: 'f1', name: 'Launch', links: 2, clicks: 60, previous: 40 },
      { folderId: 'f2', name: 'Alpha', links: 1, clicks: 20, previous: 40 },
    ])
    expect(out.map((f) => f.name)).toEqual(['Launch', 'Alpha', 'Unfiled'])
    expect(out[0]).toMatchObject({ changePct: 50, sharePct: 60 })
    expect(out[1].changePct).toBe(-50)
    expect(out[2]).toMatchObject({ folderId: null, changePct: null })
  })
  it('handles zero traffic', () => {
    expect(shapeFolderStats([{ folderId: 'f', name: 'A', links: 1, clicks: 0, previous: 0 }])[0].sharePct).toBe(0)
  })
})
