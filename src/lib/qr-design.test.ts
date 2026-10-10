import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { QrDesignError, isCustomDesign, parseQrDesign, renderQrPng, renderQrSvg, validateLogo, withScanSource } from '@/lib/qr-design'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const q = (s: string) => new URLSearchParams(s)

describe('parseQrDesign', () => {
  it('defaults to the stock look', () => {
    const d = parseQrDesign(q(''))
    expect(isCustomDesign(d)).toBe(false)
    expect(d).toMatchObject({ size: 512, margin: 2, dark: '#0f172a', level: 'M' })
  })
  it('clamps numbers, rejects bad colours and enums', () => {
    const d = parseQrDesign(q('size=99999&margin=-4&dark=red&dots=hex&eyes=x&logoScale=9'))
    expect(d).toMatchObject({ size: 4096, margin: 0, dark: '#0f172a', dotStyle: 'square', eyeStyle: 'square', logoScale: 0.3 })
  })
  it('forces level H with a logo and strips control chars from captions', () => {
    const d = parseQrDesign(q('level=L&caption=Scan%0Ame'), PNG)
    expect(d.level).toBe('H')
    expect(d.caption).toBe('Scan me')
  })
})

describe('validateLogo', () => {
  it('accepts raster data URIs', () => expect(validateLogo(PNG)).toBe(PNG))
  it.each(['https://evil.test/x.png', 'data:text/html;base64,PGI+', 'data:image/gif;base64,AAAA'])('rejects %s', v => {
    expect(() => validateLogo(v)).toThrow(QrDesignError)
  })
  it('rejects oversized logos', () => {
    expect(() => validateLogo(`data:image/png;base64,${'A'.repeat(400_000)}`)).toThrow(/KB/)
  })
  it('rejects scripted or external SVG logos', () => {
    const enc = (s: string) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
    expect(() => validateLogo(enc('<svg><script>1</script></svg>'))).toThrow(QrDesignError)
    expect(() => validateLogo(enc('<svg><image href="http://x/y.png"/></svg>'))).toThrow(QrDesignError)
    expect(() => validateLogo(enc('<svg onload="x()"></svg>'))).toThrow(QrDesignError)
    expect(validateLogo(enc('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'))).toBeTruthy()
  })
})

describe('renderQrSvg / renderQrPng', () => {
  const text = 'https://ql.test/abc123'
  it('escapes caption markup', () => {
    const svg = renderQrSvg(text, parseQrDesign(q('caption=%3Cb%3E%26')))
    expect(svg).toContain('&lt;b&gt;&amp;')
    expect(svg).not.toContain('<b>')
  })
  it('emits a gradient only when dark2 is set and honours transparency', () => {
    expect(renderQrSvg(text, parseQrDesign(q('')))).not.toContain('linearGradient')
    const svg = renderQrSvg(text, parseQrDesign(q('dark2=%23ff0000&transparent=1')))
    expect(svg).toContain('linearGradient')
    expect(svg).not.toContain('<rect width')
  })

  // The decisive property for a QR designer: every style must still scan.
  it.each([
    ['square', ''],
    ['rounded dots + rounded eyes', 'dots=rounded&eyes=rounded'],
    ['round dots', 'dots=dots'],
    ['circle eyes', 'eyes=circle'],
    ['gradient', 'dark2=%23b91c1c&dark=%231e3a8a'],
    ['caption', 'caption=Scan%20me&dots=rounded'],
  ])('scans back to the URL: %s', async (_n, qs) => {
    const d = parseQrDesign(q(`size=640&${qs}`))
    const png = await renderQrPng(text, d)
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const res = jsQR(new Uint8ClampedArray(data), info.width, info.height)
    expect(res?.data).toBe(text)
  })

  it('still scans with a centre logo', async () => {
    const d = parseQrDesign(q('size=800&dots=rounded'), PNG)
    const png = await renderQrPng(text, d)
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(text)
  })
})

describe('withScanSource', () => {
  it('tags scans without clobbering an existing source', () => {
    expect(withScanSource('https://a.test/x', true)).toBe('https://a.test/x?utm_medium=qr&utm_source=qr')
    expect(withScanSource('https://a.test/x?utm_source=poster', true)).toBe('https://a.test/x?utm_source=poster&utm_medium=qr')
    expect(withScanSource('https://a.test/x', false)).toBe('https://a.test/x')
    expect(withScanSource('not a url', true)).toBe('not a url')
    expect(withScanSource('https://a.test/x#top', true)).toBe('https://a.test/x?utm_medium=qr&utm_source=qr#top')
  })
})
