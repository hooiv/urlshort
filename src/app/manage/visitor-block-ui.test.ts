import { describe, expect, it } from 'vitest'
import { splitEntries } from '@/app/manage/[shortCode]/components/VisitorBlockSection'

describe('splitEntries', () => {
  it('splits on newlines, commas and spaces', () => {
    expect(splitEntries('1.2.3.4\n5.6.0.0/16, ::1  ')).toEqual(['1.2.3.4', '5.6.0.0/16', '::1'])
  })
})
