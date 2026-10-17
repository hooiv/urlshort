import { describe, expect, it } from 'vitest'
import { splitCountries } from '@/app/manage/[shortCode]/components/GeoFenceSection'

describe('splitCountries', () => {
  it('splits on commas, spaces and semicolons and upper-cases', () => {
    expect(splitCountries('us, de;fr  in')).toEqual(['US', 'DE', 'FR', 'IN'])
  })
  it('returns empty for blank input', () => {
    expect(splitCountries('  , ')).toEqual([])
  })
})
