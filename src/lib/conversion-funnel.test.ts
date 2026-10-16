import { describe, expect, it } from 'vitest'
import { parseFunnelSteps, parseFunnelWindow, shapeFunnel } from './conversion-funnel'

describe('parseFunnelSteps', () => {
  it('parses ordered unique keys', () => expect(parseFunnelSteps('signup, purchase')).toEqual(['signup', 'purchase']))
  it('rejects empty, duplicate, invalid and oversized lists', () => {
    expect(parseFunnelSteps(null)).toBeNull()
    expect(parseFunnelSteps('a,a')).toBeNull()
    expect(parseFunnelSteps('Bad Key')).toBeNull()
    expect(parseFunnelSteps('a,,b')).toBeNull()
    expect(parseFunnelSteps('a,b,c,d,e,f,g')).toBeNull()
  })
})
describe('parseFunnelWindow', () => {
  it('defaults and validates', () => {
    expect(parseFunnelWindow(null)).toBe(30)
    expect(parseFunnelWindow('7')).toBe(7)
    expect(parseFunnelWindow('8')).toBeNull()
    expect(parseFunnelWindow('x')).toBeNull()
  })
})
describe('shapeFunnel', () => {
  it('computes step and overall rates and drop-off', () => {
    const f = shapeFunnel(200, ['lead', 'sale'], [50, 10])
    expect(f.steps[0]).toEqual({ key: 'lead', count: 50, stepRatePct: 25, overallRatePct: 25, dropOff: 150 })
    expect(f.steps[1]).toEqual({ key: 'sale', count: 10, stepRatePct: 20, overallRatePct: 5, dropOff: 40 })
  })
  it('never lets a step exceed the previous one and handles zero clicks', () => {
    expect(shapeFunnel(10, ['a', 'b'], [5, 9]).steps[1].count).toBe(5)
    const z = shapeFunnel(0, ['a'], [3])
    expect(z.steps[0]).toMatchObject({ count: 0, stepRatePct: null, overallRatePct: null })
  })
})
