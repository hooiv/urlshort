import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceFlagsUrl,
  buildWorkspacesUrl,
  clampRolloutPercent,
  formatFlagStatus,
  formatRolloutPercent,
  getFlagSaveError,
  isValidFlagKey,
  normalizeFlagKey,
} from './flags-logic'

describe('isValidFlagKey', () => {
  it('mirrors the server flag-key pattern', () => {
    expect(isValidFlagKey('campaigns.autopilot')).toBe(true)
    expect(isValidFlagKey('A-UPPER')).toBe(false)
    expect(isValidFlagKey('has space')).toBe(false)
    expect(isValidFlagKey('')).toBe(false)
  })
})

describe('normalizeFlagKey', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeFlagKey('  campaigns.autopilot  ')).toBe('campaigns.autopilot')
  })
})

describe('clampRolloutPercent', () => {
  it('clamps to 0–100 integers and tolerates NaN', () => {
    expect(clampRolloutPercent(50.9)).toBe(50)
    expect(clampRolloutPercent(-5)).toBe(0)
    expect(clampRolloutPercent(150)).toBe(100)
    expect(clampRolloutPercent(Number.NaN)).toBe(100)
  })
})

describe('buildWorkspaceFlagsUrl', () => {
  it('encodes workspace ids used as path segments', () => {
    expect(buildWorkspaceFlagsUrl('abc')).toBe('/api/workspaces/abc/flags')
    expect(buildWorkspaceFlagsUrl('a/b')).toBe('/api/workspaces/a%2Fb/flags')
  })

  it('returns the static workspaces collection url', () => {
    expect(buildWorkspacesUrl()).toBe('/api/workspaces')
  })
})

describe('getFlagSaveError', () => {
  it('validates workspace and key before saving', () => {
    expect(getFlagSaveError('', 'k')).toBe('Select a workspace first')
    expect(getFlagSaveError('w', '   ')).toBe('Enter a flag key')
    expect(getFlagSaveError('w', 'BAD KEY')).toContain('may only contain')
    expect(getFlagSaveError('w', 'campaigns.autopilot')).toBeNull()
  })
})

describe('format helpers', () => {
  it('formats rollout and status with the shared number formatter', () => {
    expect(formatRolloutPercent(100)).toBe('100% rollout')
    expect(formatFlagStatus({ key: 'k', enabled: true, rolloutPercent: 50, config: {} })).toBe(
      'enabled · 50% rollout',
    )
    expect(formatFlagStatus({ key: 'k', enabled: false, rolloutPercent: 0, config: {} })).toBe(
      'disabled · 0% rollout',
    )
  })
})
