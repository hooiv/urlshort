import { describe, expect, it } from 'vitest'
import { deleteInBatches } from './observability'

describe('deleteInBatches', () => {
  it('stops when a batch comes back short', async () => {
    const sizes = [5, 5, 2]
    const r = await deleteInBatches(async () => sizes.shift()!, 5, 10)
    expect(r).toEqual({ deleted: 12, exhausted: false })
  })
  it('reports exhausted when the budget runs out with full batches', async () => {
    let calls = 0
    const r = await deleteInBatches(async (l) => { calls++; return l }, 5, 3)
    expect(calls).toBe(3)
    expect(r).toEqual({ deleted: 15, exhausted: true })
  })
  it('handles nothing to delete', async () => {
    expect(await deleteInBatches(async () => 0, 5, 3)).toEqual({ deleted: 0, exhausted: false })
  })
})
