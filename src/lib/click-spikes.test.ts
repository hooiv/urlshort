import { describe, expect, it } from 'vitest'
import { classifySpike, parseSpikeLimit, parseSpikeWindow, shapeSpikes } from './click-spikes'

describe('click spikes', () => {
  it('parses window and limit strictly', () => {
    expect(parseSpikeWindow(null)).toBe(24)
    expect(parseSpikeWindow('6')).toBe(6)
    expect(parseSpikeWindow('7')).toBeNull()
    expect(parseSpikeWindow('24h')).toBeNull()
    expect(parseSpikeLimit('100')).toBe(100)
    expect(parseSpikeLimit('101')).toBeNull()
    expect(parseSpikeLimit('0')).toBeNull()
  })
  it('ignores small counts and modest growth', () => {
    expect(classifySpike(19, 0)).toBeNull()
    expect(classifySpike(50, 20)).toBeNull()
    expect(classifySpike(60, 20)).toBe('notice')
    expect(classifySpike(200, 20)).toBe('surge')
    expect(classifySpike(400, 20)).toBe('viral')
    expect(classifySpike(25, 0)).toBe('viral')
  })
  it('ranks by ratio and reports null ratio without baseline', () => {
    const rows = [
      { id: 'a', shortCode: 'a', title: null, originalUrl: 'https://a.test', recent: 100, baseline: 14 * 10 },
      { id: 'b', shortCode: 'b', title: null, originalUrl: 'https://b.test', recent: 40, baseline: 0 },
      { id: 'c', shortCode: 'c', title: null, originalUrl: 'https://c.test', recent: 30, baseline: 14 * 20 },
    ]
    const out = shapeSpikes(rows, 24)
    expect(out.map((s) => s.shortCode)).toEqual(['b', 'a'])
    expect(out[0].ratio).toBeNull()
    expect(out[1].baselinePerWindow).toBe(10)
    expect(out[1].severity).toBe('surge')
  })
  it('scales the baseline to the window size', () => {
    const [s] = shapeSpikes([{ id: 'a', shortCode: 'a', title: null, originalUrl: 'u', recent: 60, baseline: BigInt(56) }], 6)
    expect(s.baselinePerWindow).toBe(1)
    expect(s.severity).toBe('viral')
  })
})
