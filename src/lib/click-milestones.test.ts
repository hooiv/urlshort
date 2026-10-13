import { describe, expect, it } from 'vitest'
import { crossedMilestone, formatMilestone, renderMilestoneEmail } from './click-milestones'

describe('click milestones', () => {
  it('finds the highest newly crossed milestone', () => {
    expect(crossedMilestone(99, 0)).toBeNull()
    expect(crossedMilestone(100, 0)).toBe(100)
    expect(crossedMilestone(100, 100)).toBeNull()
    expect(crossedMilestone(12_000, 100)).toBe(10_000)
    expect(crossedMilestone(2_000_000, 10_000)).toBe(1_000_000)
  })
  it('formats', () => {
    expect([100, 1000, 10000, 1_000_000].map(formatMilestone)).toEqual(['100', '1k', '10k', '1M'])
  })
  it('renders single and multi', () => {
    const one = renderMilestoneEmail('Ada', [{ shortCode: 'abc', originalUrl: 'https://x.com', milestone: 1000, clicks: 1042 }], 'https://ql.test')
    expect(one.subject).toBe('ql.test/abc reached 1k clicks')
    expect(one.text).toContain('1,042 now')
    const many = renderMilestoneEmail(null, [{ shortCode: 'a', originalUrl: 'u', milestone: 100, clicks: 100 }, { shortCode: 'b', originalUrl: 'u', milestone: 10000, clicks: 10001 }], 'https://ql.test')
    expect(many.subject).toBe('2 of your links hit a click milestone')
    expect(many.text.indexOf('/b ')).toBeLessThan(many.text.indexOf('/a '))
  })
})
