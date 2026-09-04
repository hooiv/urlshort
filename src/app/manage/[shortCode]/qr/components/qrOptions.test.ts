import { describe, expect, it } from 'vitest'
import {
  buildQrUrl,
  errorLevelForLogo,
  isValidHexColor,
  normalizeHexColor,
  normalizeMargin,
  normalizeQrSize,
  sanitizeFrameText,
  FRAME_TEXT_MAX_LENGTH,
} from './qrOptions'

describe('isValidHexColor / normalizeHexColor', () => {
  it('accepts #rrggbb and rejects anything else', () => {
    expect(isValidHexColor('#0f172a')).toBe(true)
    expect(isValidHexColor('#FFFFFF')).toBe(true)
    expect(isValidHexColor('  #abc123  ')).toBe(true)
    expect(isValidHexColor('red')).toBe(false)
    expect(isValidHexColor('#fff')).toBe(false)
    expect(isValidHexColor('#gggggg')).toBe(false)
    expect(isValidHexColor('')).toBe(false)
  })

  it('falls back instead of forwarding invalid colors to the API', () => {
    expect(normalizeHexColor('#0284c7', '#0f172a')).toBe('#0284c7')
    expect(normalizeHexColor('not-a-color', '#0f172a')).toBe('#0f172a')
    expect(normalizeHexColor('', '#ffffff')).toBe('#ffffff')
  })
})

describe('normalizeQrSize', () => {
  it('keeps supported sizes and clamps everything else like the server', () => {
    expect(normalizeQrSize('512')).toBe('512')
    expect(normalizeQrSize('600')).toBe('600')
    expect(normalizeQrSize('99999')).toBe('4096')
    expect(normalizeQrSize('1')).toBe('128')
    expect(normalizeQrSize('garbage')).toBe('1024')
    expect(normalizeQrSize('garbage', '512')).toBe('512')
  })
})

describe('normalizeMargin', () => {
  it('keeps offered presets and resets anything else to the standard', () => {
    expect(normalizeMargin(0)).toBe(0)
    expect(normalizeMargin(4)).toBe(4)
    expect(normalizeMargin(7)).toBe(2)
    expect(normalizeMargin(Number.NaN)).toBe(2)
  })
})

describe('sanitizeFrameText / errorLevelForLogo', () => {
  it('caps frame text length', () => {
    expect(sanitizeFrameText('x'.repeat(500))).toHaveLength(FRAME_TEXT_MAX_LENGTH)
    expect(sanitizeFrameText('SCAN ME')).toBe('SCAN ME')
  })

  it('forces maximum redundancy while a logo is embedded', () => {
    expect(errorLevelForLogo('github', 'M')).toBe('H')
    expect(errorLevelForLogo('', 'M')).toBe('M')
  })
})

describe('buildQrUrl', () => {
  it('builds the preview URL with the documented parameter shape', () => {
    const url = buildQrUrl('abc123', {
      format: 'svg',
      size: '600',
      margin: 2,
      dark: '#0f172a',
      light: '#ffffff',
      level: 'H',
      icon: '',
    })
    expect(url.startsWith('/api/links/abc123/qr?')).toBe(true)
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('format')).toBe('svg')
    expect(params.get('size')).toBe('600')
    expect(params.get('margin')).toBe('2')
    expect(params.get('dark')).toBe('#0f172a')
    expect(params.get('level')).toBe('H')
    expect(params.has('icon')).toBe(false)
    expect(params.has('download')).toBe(false)
  })

  it('adds download and icon flags for exports', () => {
    const params = new URLSearchParams(
      buildQrUrl('abc123', {
        format: 'png',
        size: '2048',
        margin: 2,
        dark: '#0f172a',
        light: '#ffffff',
        level: 'H',
        icon: 'github',
        download: true,
      }).split('?')[1]
    )
    expect(params.get('download')).toBe('1')
    expect(params.get('icon')).toBe('github')
  })

  it('never forwards invalid colors or out-of-range sizes', () => {
    const params = new URLSearchParams(
      buildQrUrl('abc123', {
        format: 'svg',
        size: 'huge',
        margin: 99,
        dark: 'nope',
        light: '',
        level: 'M',
        icon: '',
      }).split('?')[1]
    )
    expect(params.get('dark')).toBe('#0f172a')
    expect(params.get('light')).toBe('#ffffff')
    expect(params.get('size')).toBe('1024')
    expect(params.get('margin')).toBe('2')
  })

  it('encodes hostile short codes', () => {
    expect(buildQrUrl('a/b?c', {
      format: 'svg',
      size: '600',
      margin: 2,
      dark: '#0f172a',
      light: '#ffffff',
      level: 'H',
      icon: '',
    }).startsWith('/api/links/a%2Fb%3Fc/qr?')).toBe(true)
  })
})
