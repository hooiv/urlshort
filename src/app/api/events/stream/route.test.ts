import { describe, expect, it } from 'vitest'
import { filterVisibleUrlIds } from './route'

describe('filterVisibleUrlIds', () => {
  it('keeps only visible ids and drops non-strings', () => {
    const visible = new Set(['a', 'b'])
    expect(filterVisibleUrlIds(['a', 'c', 'b'], visible)).toEqual(['a', 'b'])
    expect(filterVisibleUrlIds('a', visible)).toEqual([])
    expect(filterVisibleUrlIds([1, null], visible)).toEqual([])
  })
})
