import { describe, expect, it } from 'vitest'
import { effectiveFolderRole, lowerRole, normalizeFolderName } from './folders'

describe('effectiveFolderRole', () => {
  it('leaves links outside folders and in open folders on the workspace role', () => {
    expect(effectiveFolderRole('viewer', null, null)).toBe('viewer')
    expect(effectiveFolderRole('editor', { restricted: false }, null)).toBe('editor')
  })

  it('hides restricted folders from members without a grant, but never from owners/admins', () => {
    expect(effectiveFolderRole('editor', { restricted: true }, null)).toBeNull()
    expect(effectiveFolderRole('admin', { restricted: true }, null)).toBe('admin')
    expect(effectiveFolderRole('owner', { restricted: true }, null)).toBe('owner')
  })

  it('caps a grant at the workspace role so folders can never escalate', () => {
    expect(effectiveFolderRole('viewer', { restricted: true }, 'editor')).toBe('viewer')
    expect(effectiveFolderRole('editor', { restricted: true }, 'analyst')).toBe('analyst')
    expect(effectiveFolderRole(null, { restricted: true }, 'editor')).toBeNull()
    expect(lowerRole('admin', 'viewer')).toBe('viewer')
  })

  it('validates folder names', () => {
    expect(normalizeFolderName('  Q4   launch ')).toBe('Q4 launch')
    expect(() => normalizeFolderName('   ')).toThrow()
    expect(() => normalizeFolderName('x'.repeat(61))).toThrow()
  })
})
