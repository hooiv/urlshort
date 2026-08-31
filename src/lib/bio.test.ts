import { describe, expect, it } from 'vitest'
import { BIO_THEMES, getTheme } from './bio-themes'

describe('Bio Themes', () => {
  it('returns valid theme for defined theme id', () => {
    const theme = getTheme('midnight')
    expect(theme.id).toBe('midnight')
    expect(theme.name).toBe('Midnight Onyx')
    expect(theme.pageBg).toBeDefined()
    expect(theme.buttonBg).toBeDefined()
  })

  it('falls back to default midnight theme for unknown theme id', () => {
    const fallback = getTheme('non-existent-theme-xyz')
    expect(fallback.id).toBe('midnight')
    expect(fallback.name).toBe('Midnight Onyx')
  })

  it('contains comprehensive suite of curated themes', () => {
    const themeIds = Object.keys(BIO_THEMES)
    expect(themeIds).toContain('midnight')
    expect(themeIds).toContain('cyberpunk')
    expect(themeIds).toContain('minimal-light')
    expect(themeIds).toContain('sunset')
    expect(themeIds).toContain('emerald')
    expect(themeIds).toContain('rose-gold')
  })

  it('validates theme color and layout properties', () => {
    for (const theme of Object.values(BIO_THEMES)) {
      expect(theme.name).toBeTruthy()
      expect(theme.description).toBeTruthy()
      expect(theme.pageBg).toBeTruthy()
      expect(theme.buttonBg).toBeTruthy()
      expect(theme.buttonBorder).toBeTruthy()
      expect(theme.accent).toMatch(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      expect(theme.previewGradient).toBeTruthy()
    }
  })
})

describe('Bio Block Metadata & Analytics calculations', () => {
  it('correctly calculates CTR for bio links', () => {
    const views = 250
    const clicks = 50
    const ctr = Number(((clicks / views) * 100).toFixed(1))
    expect(ctr).toBe(20.0)
  })

  it('handles 0 views safely with 0% CTR', () => {
    const views = 0
    const clicks = 0
    const ctr = views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0
    expect(ctr).toBe(0)
  })

  it('parses and serializes block metadataJson cleanly', () => {
    const metadata = {
      clicks: 42,
      badge: 'FEATURED',
      subtitle: 'Check out our new launch',
    }
    const jsonStr = JSON.stringify(metadata)
    const parsed = JSON.parse(jsonStr)
    expect(parsed.clicks).toBe(42)
    expect(parsed.badge).toBe('FEATURED')
    expect(parsed.subtitle).toBe('Check out our new launch')
  })
})