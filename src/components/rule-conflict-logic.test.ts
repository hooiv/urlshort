import { describe, expect, it } from 'vitest'
import {
  conflictGraphViewBox,
  isConflictGraphPayload,
  layoutConflictNodes,
  truncateNodeLabel,
} from './rule-conflict-logic'

describe('layoutConflictNodes', () => {
  it('places nodes on a 4-column grid matching the renderer', () => {
    const nodes = [0, 1, 2, 3, 4].map((i) => ({
      id: `r${i}`,
      label: `rule ${i}`,
      priority: i,
      weight: 10,
    }))
    const pos = layoutConflictNodes(nodes)
    expect(pos[0]).toMatchObject({ x: 30, y: 30 })
    expect(pos[3]).toMatchObject({ x: 30 + 3 * 220, y: 30 })
    expect(pos[4]).toMatchObject({ x: 30, y: 30 + 85 })
  })
})

describe('conflictGraphViewBox', () => {
  it('floors small graphs so lines stay visible', () => {
    expect(conflictGraphViewBox(1)).toEqual({ width: 920, height: 150 })
    expect(conflictGraphViewBox(20)).toEqual({ width: 1100, height: 425 })
    expect(conflictGraphViewBox(40).width).toBeGreaterThanOrEqual(920)
  })
})

describe('truncateNodeLabel', () => {
  it('caps svg text length', () => {
    expect(truncateNodeLabel('a'.repeat(40))).toHaveLength(20)
    expect(truncateNodeLabel('short')).toBe('short')
  })
})

describe('isConflictGraphPayload', () => {
  it('rejects malformed api payloads', () => {
    expect(isConflictGraphPayload(null)).toBe(false)
    expect(isConflictGraphPayload({})).toBe(false)
    expect(isConflictGraphPayload({ nodes: [], edges: [] })).toBe(true)
    expect(isConflictGraphPayload({ nodes: {}, edges: [] })).toBe(false)
  })
})
