import { describe, expect, it } from 'vitest'
import { classifyLifespan, parseLifespanLimit, shapeLifespans } from './click-lifespan'

const now = new Date('2026-10-15T00:00:00Z')
const day = 86_400_000
const row = (shortCode: string, total: number, early: number, ageDays: number) => ({
  id: shortCode, shortCode, title: null, originalUrl: 'https://x.test',
  total: BigInt(total), early, lastWeek: 3, firstClick: new Date(now.getTime() - ageDays * day),
})

describe('click lifespan', () => {
  it('parses limit strictly', () => {
    expect(parseLifespanLimit(null)).toBe(25)
    expect(parseLifespanLimit('100')).toBe(100)
    expect(parseLifespanLimit('101')).toBeNull()
    expect(parseLifespanLimit('x')).toBeNull()
  })
  it('classifies by early share boundaries', () => {
    expect(classifyLifespan(0.7)).toBe('burst')
    expect(classifyLifespan(0.69)).toBe('balanced')
    expect(classifyLifespan(0.25)).toBe('evergreen')
    expect(classifyLifespan(0.26)).toBe('balanced')
  })
  it('skips small or young links and ranks most front-loaded first', () => {
    const out = shapeLifespans([
      row('small', 49, 49, 30), row('young', 100, 90, 6),
      row('ever', 100, 10, 60), row('burst', 200, 190, 20), row('mid', 100, 50, 40),
    ], now)
    expect(out.map((l) => l.shortCode)).toEqual(['burst', 'mid', 'ever'])
    expect(out[0]).toMatchObject({ pattern: 'burst', earlyShare: 0.95, totalClicks: 200 })
    expect(out[2].pattern).toBe('evergreen')
  })
})
